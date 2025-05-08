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
model     = None
device    = torch.device('cuda' if torch.cuda.is_available() else 'cpu')


def allowed_file(fn):
    return '.' in fn and fn.rsplit('.',1)[1].lower() in app.config['ALLOWED_EXTENSIONS']


def load_blip():
    global processor, model

    # from_pretrained with cache_dir ensures files end up under `blip/`
    processor = BlipProcessor.from_pretrained(
        "Salesforce/blip-image-captioning-base",
        cache_dir=BLIP_DIR
    )
    model = BlipForConditionalGeneration.from_pretrained(
        "Salesforce/blip-image-captioning-base",
        cache_dir=BLIP_DIR
    ).to(device)
    print(f"BLIP model and processor loaded into {BLIP_DIR}")


def generate_caption(image_data):
    """Process image data (file or PIL Image) and generate a caption"""
    if isinstance(image_data, str):
        img = Image.open(image_data).convert('RGB')
    else:
        img = image_data.convert('RGB')
        
    inputs = processor(img, return_tensors="pt").to(device)
    out    = model.generate(**inputs)
    caption = processor.decode(out[0], skip_special_tokens=True)
    return caption


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
        # Process image directly from memory
        img = Image.open(f.stream)
        caption = generate_caption(img)
        audio_data = generate_speech(caption)

        # Convert image to base64 for response
        img_io = io.BytesIO()
        img.save(img_io, format=img.format or 'PNG')
        img_io.seek(0)
        img_data = base64.b64encode(img_io.read()).decode('utf-8')

        return jsonify(
            success=True,
            filename=secure_filename(f.filename),
            image_data=img_data,
            caption=caption,
            audio_data=audio_data
        )
    except Exception as e:
        return jsonify(error=str(e)), 500


@app.route('/process-frame', methods=['POST'])
def process_frame():
    """Process a webcam frame with optional audio generation"""
    if 'file' not in request.files:
        return jsonify(error="No file data"), 400
        
    file = request.files['file']
    is_live = request.form.get('live') == 'true'
    
    try:
        # Process the image directly from memory without saving
        img = Image.open(file.stream)
        
        # Generate caption
        start_time = time.time()
        caption = generate_caption(img)
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
    app.run(debug=True)
