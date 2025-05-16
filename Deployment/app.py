import os
from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename
from flask_cors import CORS
import base64
import time

import torch
from transformers import BlipProcessor, BlipForConditionalGeneration
from PIL import Image
import requests
import io

from gtts import gTTS

app = Flask(__name__)
CORS(app)

# Only need this for model caching, not for file uploads
app.config['ALLOWED_EXTENSIONS'] = {'png','jpg','jpeg','gif'}

# where HF will cache / you can pre-download here
BLIP_DIR = os.path.join(os.path.dirname(__file__), 'blip')

# Globals
processor = None
model = None
finetuned_model = None
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')


def allowed_file(fn):
    return '.' in fn and fn.rsplit('.',1)[1].lower() in app.config['ALLOWED_EXTENSIONS']


def load_blip():
    global processor, model, finetuned_model

    # Load the base model
    processor = BlipProcessor.from_pretrained(
        "Salesforce/blip-image-captioning-base",
        cache_dir=BLIP_DIR
    )
    model = BlipForConditionalGeneration.from_pretrained(
        "Salesforce/blip-image-captioning-base",
        cache_dir=BLIP_DIR
    ).to(device)
    print(f"BLIP base model loaded into {BLIP_DIR}")
    
    # Load the finetuned model
    finetuned_path = os.path.join(os.path.dirname(__file__), 'blip-finetuned')
    finetuned_model = BlipForConditionalGeneration.from_pretrained(
        finetuned_path
    ).to(device)
    print(f"BLIP finetuned model loaded from {finetuned_path}")


def generate_caption(image_data, model_type="base"):
    """Process image data (file or PIL Image) and generate a caption
    
    Parameters:
        image_data: Image file path or PIL Image object
        model_type: 'base' for original BLIP model, 'finetuned' for finetuned model
    """
    if isinstance(image_data, str):
        img = Image.open(image_data).convert('RGB')
    else:
        img = image_data.convert('RGB')
        
    inputs = processor(img, return_tensors="pt").to(device)
    
    # Select which model to use
    if model_type == "finetuned":
        out = finetuned_model.generate(**inputs)
    else:
        out = model.generate(**inputs)
        
    caption = processor.decode(out[0], skip_special_tokens=True)
    return caption


def generate_captions_comparison(image_data):
    """Generate captions using both models for comparison
    
    Parameters:
        image_data: Image file path or PIL Image object
        
    Returns:
        dict: Dictionary with both base and finetuned captions
    """
    if isinstance(image_data, str):
        img = Image.open(image_data).convert('RGB')
    else:
        img = image_data.convert('RGB')
    
    inputs = processor(img, return_tensors="pt").to(device)
    
    # Generate captions with both models
    base_out = model.generate(**inputs)
    finetuned_out = finetuned_model.generate(**inputs)
    
    base_caption = processor.decode(base_out[0], skip_special_tokens=True)
    finetuned_caption = processor.decode(finetuned_out[0], skip_special_tokens=True)
    
    return {
        "base_caption": base_caption,
        "finetuned_caption": finetuned_caption
    }


def generate_speech(text):
    """Generate speech from text and return as base64 encoded data"""
    audio_io = io.BytesIO()
    tts = gTTS(text=text, lang='en', tld='com', slow=False)
    tts.write_to_fp(audio_io)
    audio_io.seek(0)
    audio_data = base64.b64encode(audio_io.read()).decode('utf-8')
    return audio_data


@app.route('/')
def index():
    return render_template('index.html')  # your upload form


@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify(error="No file part"), 400

    f = request.files['file']
    if f.filename == '':
        return jsonify(error="No selected file"), 400

    if not allowed_file(f.filename):
        return jsonify(error="Invalid file type"), 400

    try:
        # Get the model type parameter (default to 'base')
        model_type = request.form.get('model_type', 'base')
        # Get the comparison mode parameter
        compare_mode = request.form.get('compare_mode') == 'true'
        
        # Process image directly from memory
        img = Image.open(f.stream)
        
        # Handle different modes
        if compare_mode:
            # Generate captions from both models
            captions = generate_captions_comparison(img)
            # Use the first caption for speech
            caption_for_speech = captions['base_caption']
            audio_data = generate_speech(caption_for_speech)
        else:
            # Generate caption using selected model
            caption = generate_caption(img, model_type)
            audio_data = generate_speech(caption)
            captions = None

        # Convert image to base64 for response
        img_io = io.BytesIO()
        img.save(img_io, format=img.format or 'PNG')
        img_io.seek(0)
        img_data = base64.b64encode(img_io.read()).decode('utf-8')

        # Prepare response
        response = {
            'success': True,
            'filename': secure_filename(f.filename),
            'image_data': img_data,
            'audio_data': audio_data
        }
        
        # Add caption data based on mode
        if compare_mode:
            response['compare_mode'] = True
            response['base_caption'] = captions['base_caption']
            response['finetuned_caption'] = captions['finetuned_caption']
        else:
            response['caption'] = caption
        
        return jsonify(response)
    except Exception as e:
        return jsonify(error=str(e)), 500


@app.route('/process-frame', methods=['POST'])
def process_frame():
    """Process a webcam frame with optional audio generation"""
    if 'file' not in request.files:
        return jsonify(error="No file data"), 400
        
    file = request.files['file']
    is_live = request.form.get('live') == 'true'
    model_type = request.form.get('model_type', 'base')
    compare_mode = request.form.get('compare_mode') == 'true'
    
    try:
        # Process the image directly from memory without saving
        img = Image.open(file.stream)
        
        start_time = time.time()
        
        # Handle different modes
        if compare_mode:
            # Generate captions from both models
            captions = generate_captions_comparison(img)
            processing_time = time.time() - start_time
            
            response = {
                'success': True,
                'compare_mode': True,
                'base_caption': captions['base_caption'],
                'finetuned_caption': captions['finetuned_caption'],
                'processing_time': processing_time
            }
            
            # For non-live captures, optionally generate audio (using base caption for now)
            if not is_live:
                audio_data = generate_speech(captions['base_caption'])
                response['audio_data'] = audio_data
        else:
            # Generate caption using selected model
            caption = generate_caption(img, model_type)
            processing_time = time.time() - start_time
            
            response = {
                'success': True,
                'caption': caption,
                'processing_time': processing_time
            }
            
            # For non-live captures, optionally generate audio
            if not is_live:
                audio_data = generate_speech(caption)
                response['audio_data'] = audio_data
                
        return jsonify(response)
        
    except Exception as e:
        print(f"Error processing frame: {str(e)}")
        return jsonify(error=str(e)), 500


if __name__ == '__main__':
    # preload model once
    load_blip()
    # Run Flask app, allowing port to be overridden by environment variables
    port = int(os.environ.get("FLASK_PORT", 4999))
    app.run(debug=True, port=port)