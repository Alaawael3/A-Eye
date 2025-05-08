import React, { useState, useEffect, useRef } from 'react';

const App = () => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [caption, setCaption] = useState('Your caption will appear here...');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Webcam state
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [isLiveCaptioning, setIsLiveCaptioning] = useState(false);
  const [processingFrame, setProcessingFrame] = useState(false);
  const [availableCameras, setAvailableCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  
  // Refs for webcam elements
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const previousFrameRef = useRef(null);
  const captureIntervalRef = useRef(null);
  
  // Constants for webcam processing
  const FRAME_DIFF_THRESHOLD = 0.15;
  const MIN_CAPTURE_INTERVAL = 1500;
  const COMPRESSION_QUALITY = 0.6;

  // Handle file change
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onload = () => {
        setPreview(reader.result);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;

    setIsLoading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/upload', true);

      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(progress);
        }
      });

      // Handle response
      xhr.onload = function() {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          setTimeout(() => {
            setCaption(response.caption);
            setIsLoading(false);
          }, 1000);
        } else {
          alert('Error processing image');
          setIsLoading(false);
        }
      };

      // Handle error
      xhr.onerror = function() {
        alert('Network error. Please check your connection.');
        setIsLoading(false);
      };

      xhr.send(formData);
    } catch (error) {
      console.error('Error:', error);
      setIsLoading(false);
    }
  };
  
  // Toggle webcam on/off
  const toggleWebcam = async () => {
    if (isWebcamActive) {
      stopWebcam();
    } else {
      startWebcam(selectedCamera);
    }
  };
  
  // Start webcam with selected device
  const startWebcam = async (deviceId) => {
    try {
      // Prepare constraints - use selected device or default
      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };
      
      // If a specific device was selected, add it to constraints
      if (deviceId) {
        constraints.video.deviceId = { exact: deviceId };
      }
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsWebcamActive(true);
      }
      
      // If this is the first time getting camera access and we don't have labels,
      // enumerate again to get device labels
      if (availableCameras.length > 0 && !availableCameras[0].label) {
        getAvailableCameras();
      }
    } catch (err) {
      console.error('Error accessing webcam:', err);
      alert('Unable to access the camera. Please ensure you have granted camera permissions.');
    }
  };
  
  // Stop webcam
  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setIsWebcamActive(false);
      
      // Stop live captioning if active
      if (isLiveCaptioning) {
        toggleLiveCaptioning();
      }
    }
  };
  
  // Toggle live captioning
  const toggleLiveCaptioning = () => {
    setIsLiveCaptioning(prev => !prev);
  };
  
  // Capture a single frame
  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current || !isWebcamActive) return;
    
    const context = canvasRef.current.getContext('2d');
    const video = videoRef.current;
    
    // Set canvas dimensions to match video
    canvasRef.current.width = video.videoWidth;
    canvasRef.current.height = video.videoHeight;
    
    // Draw video frame to canvas
    context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
    
    // Get compressed image
    const imageData = canvasRef.current.toDataURL('image/jpeg', COMPRESSION_QUALITY);
    setPreview(imageData);
    
    // Upload the captured frame
    uploadCapturedFrame(imageData);
  };
  
  // Check if current frame is significantly different from previous frame
  const hasSignificantChange = (context) => {
    if (!previousFrameRef.current) return true;
    
    const currentImageData = context.getImageData(
      0, 0, 
      canvasRef.current.width, 
      canvasRef.current.height
    ).data;
    
    const prevData = previousFrameRef.current;
    const pixelCount = currentImageData.length / 4; // RGBA values
    
    // Sample every 10th pixel for performance
    let diffCount = 0;
    for (let i = 0; i < currentImageData.length; i += 40) { // Check every 10th pixel
      const r1 = prevData[i];
      const g1 = prevData[i+1];
      const b1 = prevData[i+2];
      
      const r2 = currentImageData[i];
      const g2 = currentImageData[i+1];
      const b2 = currentImageData[i+2];
      
      // Calculate color difference
      const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
      
      // If pixel has changed significantly
      if (diff > 30) {
        diffCount++;
      }
    }
    
    // Calculate percentage of changed pixels
    const diffRatio = diffCount / (pixelCount / 10);
    return diffRatio > FRAME_DIFF_THRESHOLD;
  };
  
  // Upload captured frame to server
  const uploadCapturedFrame = (imageData, isLive = false) => {
    if (!isLive) setIsLoading(true);
    setProcessingFrame(true);
    
    // Convert base64 to blob
    const blob = dataURItoBlob(imageData);
    const formData = new FormData();
    formData.append('file', blob, 'webcam-capture.jpg');
    formData.append('live', isLive ? 'true' : 'false');
    
    fetch('/process-frame', {
      method: 'POST',
      body: formData
    })
    .then(response => response.json())
    .then(data => {
      if (data.caption) {
        setCaption(data.caption);
      }
      if (!isLive) setIsLoading(false);
      setProcessingFrame(false);
    })
    .catch(error => {
      console.error('Error:', error);
      if (!isLive) setIsLoading(false);
      setProcessingFrame(false);
    });
  };
  
  // Helper to convert data URI to blob
  const dataURItoBlob = (dataURI) => {
    // Convert base64/URLEncoded data component to raw binary data
    let byteString;
    if (dataURI.split(',')[0].indexOf('base64') >= 0) {
      byteString = atob(dataURI.split(',')[1]);
    } else {
      byteString = unescape(dataURI.split(',')[1]);
    }
    
    // Extract content type
    const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
    
    // Create buffer and view
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    
    // Set the bytes of the buffer to the correct values
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    
    return new Blob([ab], {type: mimeString});
  };
  
  // Effect for live captioning
  useEffect(() => {
    if (isLiveCaptioning && isWebcamActive) {
      // Clear any existing interval
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
      
      // Start new interval for capturing frames
      captureIntervalRef.current = setInterval(() => {
        if (!videoRef.current || !canvasRef.current || processingFrame) return;
        
        const context = canvasRef.current.getContext('2d');
        const video = videoRef.current;
        
        // Set canvas dimensions to match video
        canvasRef.current.width = video.videoWidth;
        canvasRef.current.height = video.videoHeight;
        
        // Draw video frame to canvas
        context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        
        // Check if frame has significant change before processing
        if (previousFrameRef.current && !hasSignificantChange(context)) {
          return;
        }
        
        // Store current frame data for next comparison
        previousFrameRef.current = context.getImageData(
          0, 0, 
          canvasRef.current.width, 
          canvasRef.current.height
        ).data;
        
        // Get compressed image and process
        const imageData = canvasRef.current.toDataURL('image/jpeg', COMPRESSION_QUALITY);
        setPreview(imageData);
        uploadCapturedFrame(imageData, true);
      }, MIN_CAPTURE_INTERVAL);
      
      // Clean up on unmount or when disabling live captioning
      return () => {
        if (captureIntervalRef.current) {
          clearInterval(captureIntervalRef.current);
        }
      };
    } else if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
    }
  }, [isLiveCaptioning, isWebcamActive, processingFrame]);
  
  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
    };
  }, []);

  // Enumerate available camera devices
  useEffect(() => {
    // Request initial permission to access camera devices with labels
    async function requestInitialPermissions() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        // Stop the stream immediately after getting permissions
        stream.getTracks().forEach(track => track.stop());
        // Now we can get the device list with labels
        getAvailableCameras();
      } catch (err) {
        console.log('Initial permission request denied:', err);
        // We can still list devices, but they won't have labels
        getAvailableCameras();
      }
    }
    
    requestInitialPermissions();
  }, []);
  
  // Get list of available camera devices
  const getAvailableCameras = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(device => device.kind === 'videoinput');
      setAvailableCameras(cameras);
      
      // Set the first camera as default if available
      if (cameras.length > 0 && !selectedCamera) {
        setSelectedCamera(cameras[0].deviceId);
      }
    } catch (err) {
      console.error('Error listing camera devices:', err);
    }
  };

  // Handle camera selection change
  const handleCameraChange = (e) => {
    setSelectedCamera(e.target.value);
    
    // If webcam is active, restart it with the new device
    if (isWebcamActive) {
      stopWebcam();
      startWebcam(e.target.value);
    }
  };

  return (
    <>
      <ShaderGradient />
      <div className="content-container">
        <header>
          <h1>A-Eye</h1>
          <h2>Image Captioning</h2>
        </header>
        
        <main className="glass-morphism">
          <div className="upload-container">
            <form id="upload-form" onSubmit={handleSubmit}>
              <div className="file-input-container">
                <input 
                  type="file" 
                  id="file-input" 
                  onChange={handleFileChange} 
                  accept="image/*" 
                  className="file-input"
                />
                <label htmlFor="file-input" className="file-input-label">
                  <i className="fas fa-cloud-upload-alt"></i>
                  <span>{file ? file.name : 'Choose an image'}</span>
                </label>
              </div>
              <button 
                type="submit" 
                id="upload-button" 
                disabled={!file || isLoading}
                className={isLoading ? 'loading' : ''}
              >
                {isLoading ? 'Processing...' : 'Upload & Generate Caption'}
              </button>
            </form>
            
            {/* Webcam Controls */}
            <div className="webcam-controls">
              <button 
                className={`webcam-button ${isWebcamActive ? 'active' : ''}`} 
                onClick={toggleWebcam}
              >
                <i className={`fas fa-${isWebcamActive ? 'video-slash' : 'video'}`}></i>
                {isWebcamActive ? ' Stop Camera' : ' Start Camera'}
              </button>
              
              <div className="camera-select-container">
                <select 
                  value={selectedCamera}
                  onChange={handleCameraChange}
                  disabled={availableCameras.length === 0}
                >
                  {availableCameras.length === 0 ? (
                    <option value="">No cameras found</option>
                  ) : (
                    availableCameras.map((camera, index) => (
                      <option key={camera.deviceId} value={camera.deviceId}>
                        {camera.label || `Camera ${index + 1}`}
                      </option>
                    ))
                  )}
                </select>
                <i className="fas fa-caret-down"></i>
              </div>
            </div>
            
            {/* Webcam Container */}
            {isWebcamActive && (
              <div className="webcam-container">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted
                />
                <canvas ref={canvasRef} style={{ display: 'none' }} />
                <div className="webcam-buttons">
                  <button 
                    onClick={captureFrame}
                    disabled={isLoading || processingFrame}
                  >
                    <i className="fas fa-camera"></i> Take Photo
                  </button>
                  <button 
                    onClick={toggleLiveCaptioning}
                    disabled={processingFrame}
                    className={isLiveCaptioning ? 'active' : ''}
                  >
                    <i className={`fas fa-sync ${isLiveCaptioning ? 'fa-spin' : ''}`}></i>
                    {isLiveCaptioning ? ' Live Captioning ON' : ' Enable Live Captioning'}
                  </button>
                </div>
              </div>
            )}
            
            {uploadProgress > 0 && uploadProgress < 100 && (
              <div className="progress-container">
                <div 
                  className="progress-bar" 
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            )}
          </div>
          
          <div className="result-container">
            <div className="image-preview">
              {isLoading && (
                <div className="loader">
                  <div className="spinner"></div>
                  <p>Generating caption...</p>
                </div>
              )}
              {preview && (
                <img 
                  src={preview} 
                  alt="Preview" 
                  style={{ display: isLoading ? 'none' : 'block' }}
                />
              )}
              {!preview && !isLoading && (
                <div className="no-image">
                  <i className="fas fa-image"></i>
                  <p>Image preview will appear here</p>
                </div>
              )}
            </div>
            
            <div className="caption-container">
              <h3>Generated Caption</h3>
              <div className="caption-box">
                <p>{caption}</p>
              </div>
            </div>
          </div>
        </main>
        
        <footer>
          <p>© 2025 A-Eye Image Captioning</p>
        </footer>
      </div>
    </>
  );
};

export default App;