document.addEventListener('DOMContentLoaded', function() {
    // Clear any previously stored image data
    localStorage.removeItem('lastUploadedImage');
    
    // Elements
    const form = document.getElementById('upload-form');
    const fileInput = document.getElementById('file-input');
    const uploadButton = document.getElementById('upload-button');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const previewImage = document.getElementById('preview-image');
    const captionText = document.getElementById('caption-text');
    const loader = document.getElementById('loader');
    const fileInputLabel = document.querySelector('label[for="file-input"] span');
    
    // Audio elements
    const audioControls = document.getElementById('audio-controls');
    const captionAudio = document.getElementById('caption-audio');
    const playButton = document.getElementById('play-button');
    const replayButton = document.getElementById('replay-button');
    const muteButton = document.getElementById('mute-button');
    const audioProgressFill = document.getElementById('audio-progress-fill');
    const audioTime = document.getElementById('audio-time');
    
    // Webcam elements
    const webcamButton = document.getElementById('webcam-button');
    const webcamContainer = document.getElementById('webcam-container');
    const webcamVideo = document.getElementById('webcam-video');
    const webcamCanvas = document.getElementById('webcam-canvas');
    const webcamCaptureButton = document.getElementById('webcam-capture');
    const liveCaptioningToggle = document.getElementById('live-captioning-toggle');
    const cameraSelect = document.getElementById('camera-select');
    
    // Audio state
    let isPlaying = false;
    let isMuted = false;
    
    // Webcam state
    let stream = null;
    let isWebcamActive = false;
    let isLiveCaptioningEnabled = false;
    let previousImageData = null;
    let captureInterval = null;
    let processingImage = false;
    let availableCameras = [];
    
    // Frame difference threshold (0-1, higher = less sensitive)
    const FRAME_DIFF_THRESHOLD = 0.15;
    // Minimum time between captures in ms
    const MIN_CAPTURE_INTERVAL = 1500;
    // Compression quality (0-1, lower = more compression)
    const COMPRESSION_QUALITY = 0.6;
    
    // Reset any previously displayed images
    previewImage.src = '#';
    previewImage.style.display = 'none';
    uploadButton.disabled = true;
    
    // Initial device enumeration
    enumerateDevices();
    
    // List available camera devices
    async function enumerateDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            availableCameras = devices.filter(device => device.kind === 'videoinput');
            
            // Clear and update dropdown
            cameraSelect.innerHTML = '';
            
            if (availableCameras.length === 0) {
                const option = document.createElement('option');
                option.value = '';
                option.text = 'No cameras found';
                cameraSelect.appendChild(option);
                cameraSelect.disabled = true;
            } else {
                availableCameras.forEach((device, index) => {
                    const option = document.createElement('option');
                    option.value = device.deviceId;
                    
                    // Format the label to be more user-friendly
                    let label = device.label || `Camera ${index + 1}`;
                    // Trim long labels
                    if (label.length > 30) {
                        label = label.substring(0, 27) + '...';
                    }
                    
                    option.text = label;
                    cameraSelect.appendChild(option);
                });
                cameraSelect.disabled = false;
            }
        } catch (err) {
            console.error('Error enumerating devices:', err);
            cameraSelect.innerHTML = '<option value="">Camera access denied</option>';
            cameraSelect.disabled = true;
        }
    }
    
    // Audio control functions
    function playAudio() {
        if (captionAudio.paused) {
            captionAudio.play();
            playButton.innerHTML = '<i class="fas fa-pause"></i>';
            playButton.title = "Pause";
            isPlaying = true;
        } else {
            captionAudio.pause();
            playButton.innerHTML = '<i class="fas fa-play"></i>';
            playButton.title = "Play";
            isPlaying = false;
        }
    }
    
    function replayAudio() {
        captionAudio.currentTime = 0;
        captionAudio.play();
        playButton.innerHTML = '<i class="fas fa-pause"></i>';
        playButton.title = "Pause";
        isPlaying = true;
    }
    
    function toggleMute() {
        isMuted = !isMuted;
        captionAudio.muted = isMuted;
        
        if (isMuted) {
            muteButton.innerHTML = '<i class="fas fa-volume-mute"></i>';
            muteButton.title = "Unmute";
        } else {
            muteButton.innerHTML = '<i class="fas fa-volume-up"></i>';
            muteButton.title = "Mute";
        }
    }
    
    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        seconds = Math.floor(seconds % 60);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    }
    
    // Webcam functions
    function toggleWebcam() {
        if (isWebcamActive) {
            stopWebcam();
        } else {
            startWebcam();
        }
    }
    
    async function startWebcam() {
        try {
            // Get the selected device ID from the dropdown
            const selectedDeviceId = cameraSelect.value;
            
            // Prepare constraints - if no device is selected, use default
            const constraints = { 
                video: { 
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                } 
            };
            
            // If a specific device was selected, add it to constraints
            if (selectedDeviceId) {
                constraints.video.deviceId = { exact: selectedDeviceId };
            }
            
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // If this is the first time getting camera access and we don't have labels,
            // enumerate again to get device labels
            if (availableCameras.length > 0 && !availableCameras[0].label) {
                await enumerateDevices();
            }
            
            webcamVideo.srcObject = stream;
            webcamContainer.style.display = 'block';
            webcamButton.innerHTML = '<i class="fas fa-video-slash"></i> Stop Camera';
            webcamButton.classList.add('active');
            isWebcamActive = true;
            
            // Enable webcam capture button
            webcamCaptureButton.disabled = false;
            liveCaptioningToggle.disabled = false;
        } catch (err) {
            console.error("Error accessing webcam:", err);
            alert("Unable to access the camera. Please ensure you have granted camera permissions.");
        }
    }
    
    function stopWebcam() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            webcamVideo.srcObject = null;
        }
        webcamContainer.style.display = 'none';
        webcamButton.innerHTML = '<i class="fas fa-video"></i> Start Camera';
        webcamButton.classList.remove('active');
        isWebcamActive = false;
        
        // Disable webcam buttons
        webcamCaptureButton.disabled = true;
        liveCaptioningToggle.disabled = true;
        
        // Stop live captioning if active
        if (isLiveCaptioningEnabled) {
            toggleLiveCaptioning();
        }
    }
    
    function captureFrame() {
        if (!isWebcamActive) return;
        
        const context = webcamCanvas.getContext('2d');
        // Match canvas size to video
        webcamCanvas.width = webcamVideo.videoWidth;
        webcamCanvas.height = webcamVideo.videoHeight;
        
        // Draw video frame to canvas
        context.drawImage(webcamVideo, 0, 0, webcamCanvas.width, webcamCanvas.height);
        
        // Get image data as compressed JPEG
        const imageData = compressImage(webcamCanvas);
        
        // Display the captured frame
        previewImage.src = imageData;
        previewImage.style.display = 'block';
        
        // Upload the image
        uploadCapturedImage(imageData);
    }
    
    function compressImage(canvas) {
        return canvas.toDataURL('image/jpeg', COMPRESSION_QUALITY);
    }
    
    function toggleLiveCaptioning() {
        isLiveCaptioningEnabled = !isLiveCaptioningEnabled;
        
        if (isLiveCaptioningEnabled) {
            liveCaptioningToggle.classList.add('active');
            liveCaptioningToggle.innerHTML = '<i class="fas fa-sync fa-spin"></i> Live Captioning ON';
            previousImageData = null;
            startLiveCapturing();
        } else {
            liveCaptioningToggle.classList.remove('active');
            liveCaptioningToggle.innerHTML = '<i class="fas fa-sync"></i> Enable Live Captioning';
            stopLiveCapturing();
        }
    }
    
    function startLiveCapturing() {
        if (captureInterval) clearInterval(captureInterval);
        
        captureInterval = setInterval(() => {
            if (processingImage || !isWebcamActive || !isLiveCaptioningEnabled) return;
            
            const context = webcamCanvas.getContext('2d');
            webcamCanvas.width = webcamVideo.videoWidth;
            webcamCanvas.height = webcamVideo.videoHeight;
            
            context.drawImage(webcamVideo, 0, 0, webcamCanvas.width, webcamCanvas.height);
            
            // Check if frame has significant change before processing
            if (previousImageData && !hasSignificantChange(context)) {
                return;
            }
            
            // Compress and process the image
            const imageData = compressImage(webcamCanvas);
            processingImage = true;
            
            // Store current image data for the next comparison
            previousImageData = context.getImageData(0, 0, webcamCanvas.width, webcamCanvas.height).data;
            
            // Display and upload the captured frame
            previewImage.src = imageData;
            previewImage.style.display = 'block';
            uploadCapturedImage(imageData, true);
        }, MIN_CAPTURE_INTERVAL);
    }
    
    function stopLiveCapturing() {
        if (captureInterval) {
            clearInterval(captureInterval);
            captureInterval = null;
        }
    }
    
    function hasSignificantChange(context) {
        if (!previousImageData) return true;
        
        // Get current frame data
        const currentImageData = context.getImageData(0, 0, webcamCanvas.width, webcamCanvas.height).data;
        const pixelCount = currentImageData.length / 4; // RGBA values
        
        // Sample every 10th pixel for performance
        let diffCount = 0;
        for (let i = 0; i < currentImageData.length; i += 40) { // Check every 10th pixel (RGBA = 4 values)
            const r1 = previousImageData[i];
            const g1 = previousImageData[i+1];
            const b1 = previousImageData[i+2];
            
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
    }
    
    function uploadCapturedImage(imageData, isLive = false) {
        // Show processing indication
        if (!isLive) {
            loader.style.display = 'flex';
        }
        
        // Convert base64 to blob
        const blob = dataURItoBlob(imageData);
        const formData = new FormData();
        formData.append('file', blob, 'webcam-capture.jpg');
        formData.append('live', isLive ? 'true' : 'false');
        
        // Send to server
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/process-frame', true);
        
        xhr.onload = function() {
            if (xhr.status === 200) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    // Update caption
                    captionText.textContent = response.caption || "No caption was generated.";
                    document.querySelector('.caption-box').classList.add('has-content');
                    
                    // Don't play audio for live captions
                    if (!isLive && response.audio_url) {
                        captionAudio.src = response.audio_url;
                        audioControls.style.display = 'block';
                        
                        // Auto-play with a slight delay
                        setTimeout(() => {
                            captionAudio.play();
                            playButton.innerHTML = '<i class="fas fa-pause"></i>';
                            playButton.title = "Pause";
                            isPlaying = true;
                        }, 500);
                    }
                } catch (e) {
                    console.error("Error parsing server response:", e);
                }
            } else {
                captionText.textContent = "Error processing image. Please try again.";
            }
            
            if (!isLive) {
                loader.style.display = 'none';
            }
            processingImage = false;
        };
        
        xhr.onerror = function() {
            captionText.textContent = "Network error. Please check your connection.";
            if (!isLive) {
                loader.style.display = 'none';
            }
            processingImage = false;
        };
        
        xhr.send(formData);
    }
    
    function dataURItoBlob(dataURI) {
        // Convert base64/URLEncoded data component to raw binary data
        let byteString;
        if (dataURI.split(',')[0].indexOf('base64') >= 0) {
            byteString = atob(dataURI.split(',')[1]);
        } else {
            byteString = unescape(dataURI.split(',')[1]);
        }
        
        // Extract content type and create view into the buffer
        const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        
        // Set the bytes of the buffer to the correct values
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        
        return new Blob([ab], {type: mimeString});
    }
    
    // Audio event listeners
    playButton.addEventListener('click', playAudio);
    replayButton.addEventListener('click', replayAudio);
    muteButton.addEventListener('click', toggleMute);
    
    captionAudio.addEventListener('timeupdate', function() {
        const percentage = (captionAudio.currentTime / captionAudio.duration) * 100;
        audioProgressFill.style.width = percentage + '%';
        audioTime.textContent = formatTime(captionAudio.currentTime);
    });
    
    captionAudio.addEventListener('ended', function() {
        playButton.innerHTML = '<i class="fas fa-play"></i>';
        playButton.title = "Play";
        isPlaying = false;
    });
    
    // Event listeners for webcam
    if (webcamButton) {
        webcamButton.addEventListener('click', toggleWebcam);
    }
    
    if (webcamCaptureButton) {
        webcamCaptureButton.addEventListener('click', captureFrame);
    }
    
    if (liveCaptioningToggle) {
        liveCaptioningToggle.addEventListener('click', toggleLiveCaptioning);
    }
    
    // Event listener for camera selection change
    if (cameraSelect) {
        cameraSelect.addEventListener('change', function() {
            // If webcam is active, restart it with the new device
            if (isWebcamActive) {
                stopWebcam();
                startWebcam();
            }
        });
    }
    
    // Request permissions on page load to enumerate all devices with labels
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(tempStream => {
            // Stop the stream immediately, we just needed it for permissions
            tempStream.getTracks().forEach(track => track.stop());
            // Now enumerate devices with labels
            enumerateDevices();
        })
        .catch(err => {
            console.log('Initial permission request denied:', err);
            // We can still enumerate devices, but they won't have labels
            enumerateDevices();
        });
    
    // Arrange result containers side by side
    const resultContainer = document.getElementById('result-container');
    resultContainer.classList.add('content-wrapper');
    
    // File input change event
    fileInput.addEventListener('change', function() {
        const file = this.files[0];
        
        if (file) {
            // Update label to show file name (without check mark)
            const fileName = file.name.length > 25 ? file.name.substring(0, 22) + '...' : file.name;
            fileInputLabel.textContent = fileName;
            
            // Don't add checkmark or file-selected class
            // fileInputLabel.parentElement.classList.add('file-selected');
            
            // Enable upload button
            uploadButton.disabled = false;
            
            // Create file preview and adjust container size
            const reader = new FileReader();
            
            reader.onload = function(e) {
                // Create a new image to get dimensions
                const img = new Image();
                img.onload = function() {
                    // Set image preview
                    previewImage.src = e.target.result;
                    previewImage.style.display = 'block';
                    
                    // Adjust image container to fit image dimensions
                    const imagePreview = document.querySelector('.image-preview');
                    imagePreview.style.width = '100%';
                    imagePreview.style.height = 'auto';
                    
                    // Reset caption
                    captionText.textContent = "Your caption will appear here...";
                    document.querySelector('.caption-box').classList.remove('has-content');
                };
                img.src = e.target.result;
            };
            
            reader.readAsDataURL(file);
        } else {
            // Reset the UI if no file selected
            resetUI();
        }
    });
    
    // Form submit event
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const file = fileInput.files[0];
        if (!file) return;
        
        // Show progress but don't change button colors
        progressContainer.style.display = 'block';
        progressBar.style.width = '0%';
        // Don't add loading class to button
        // uploadButton.classList.add('loading');
        uploadButton.disabled = true;
        
        // Create FormData
        const formData = new FormData();
        formData.append('file', file);
        
        // Show the loader in the image preview but keep the image displayed underneath
        loader.style.display = 'flex';
        
        // Create AJAX request
        const xhr = new XMLHttpRequest();
        
        // Upload progress event
        xhr.upload.addEventListener('progress', function(e) {
            if (e.lengthComputable) {
                const percent = (e.loaded / e.total) * 100;
                progressBar.style.width = percent + '%';
            }
        });
        
        // Load completion event
        xhr.addEventListener('load', function() {
            if (xhr.status === 200) {
                // Parse response
                const response = JSON.parse(xhr.responseText);
                
                // Show the generated caption after a short delay
                setTimeout(function() {
                    // Hide loading states
                    progressContainer.style.display = 'none';
                    // Don't modify button classes
                    // uploadButton.classList.remove('loading');
                    uploadButton.disabled = false;
                    loader.style.display = 'none';
                    
                    // Display caption and adjust container size
                    captionText.textContent = response.caption || "No caption was generated.";
                    document.querySelector('.caption-box').classList.add('has-content');
                    
                    // Handle audio if available
                    if (response.audio_url) {
                        captionAudio.src = response.audio_url;
                        audioControls.style.display = 'block';
                        
                        // Auto-play with a slight delay
                        setTimeout(() => {
                            captionAudio.play();
                            playButton.innerHTML = '<i class="fas fa-pause"></i>';
                            playButton.title = "Pause";
                            isPlaying = true;
                        }, 500);
                    }
                }, 500);
            } else {
                // Error handling
                progressContainer.style.display = 'none';
                // Don't modify button classes
                // uploadButton.classList.remove('loading');
                uploadButton.disabled = false;
                loader.style.display = 'none';
                captionText.textContent = "Error generating caption. Please try again.";
                audioControls.style.display = 'none';
            }
        });
        
        // Error event
        xhr.addEventListener('error', function() {
            progressContainer.style.display = 'none';
            // Don't modify button classes
            // uploadButton.classList.remove('loading');
            uploadButton.disabled = false;
            loader.style.display = 'none';
            captionText.textContent = "Network error. Please check your connection and try again.";
            audioControls.style.display = 'none';
        });
        
        // Open and send request
        xhr.open('POST', '/upload', true);
        xhr.send(formData);
    });
    
    function resetUI() {
        // Reset file input label
        fileInputLabel.textContent = 'Choose an image';
        
        // Don't modify file-selected class
        // fileInputLabel.parentElement.classList.remove('file-selected');
        
        // Disable upload button
        uploadButton.disabled = true;
        
        // Hide image preview
        previewImage.src = '#';
        previewImage.style.display = 'none';
        
        // Reset caption
        captionText.textContent = "Your caption will appear here...";
        document.querySelector('.caption-box').classList.remove('has-content');
        
        // Reset audio
        audioControls.style.display = 'none';
        captionAudio.pause();
        captionAudio.src = '';
        
        // Reset webcam
        if (isWebcamActive) {
            stopWebcam();
        }
    }
    
    // Initialize - hide progress bar and loader
    progressContainer.style.display = 'none';
    loader.style.display = 'none';
    audioControls.style.display = 'none';
    if (webcamContainer) {
        webcamContainer.style.display = 'none';
    }
});