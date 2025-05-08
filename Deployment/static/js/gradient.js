// Custom ThreeJS Gradient Background Implementation
(function() {
    // Initialize gradient when DOM is loaded
    window.addEventListener('DOMContentLoaded', () => {
        createGradient();
    });
    
    // Custom ThreeJS gradient implementation
    function createGradient() {
        // Create canvas if needed
        let canvas = document.getElementById('background-gradient');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'background-gradient';
            canvas.style.position = 'fixed';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.zIndex = '-1';
            document.body.prepend(canvas);
        }
        
        // Setup Three.js
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 5;
        
        const renderer = new THREE.WebGLRenderer({ 
            canvas: canvas, 
            alpha: true, 
            antialias: true 
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        // Create uniforms for the shader
        const uniforms = {
            uTime: { value: 10 },
            uColor1: { value: new THREE.Color("#ff7073") },
            uColor2: { value: new THREE.Color("#8591ff") },
            uColor3: { value: new THREE.Color("#ffffff") },
            uDensity: { value: 3.5 },
            uSpeed: { value: 0.1 },
            uStrength: { value: 0.91 },
            uBrightness: { value: 0.7 },
            uReflection: { value: 0 },
            uAmplitude: { value: 0 },
            uFrequency: { value: 0 }
        };
        
        // Create shader material
        const material = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uTime;
                uniform vec3 uColor1;
                uniform vec3 uColor2;
                uniform vec3 uColor3;
                uniform float uDensity;
                uniform float uSpeed;
                uniform float uStrength;
                uniform float uBrightness;
                uniform float uReflection;
                uniform float uAmplitude;
                uniform float uFrequency;
                varying vec2 vUv;
                
                // Simplex noise function
                vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
                float snoise(vec2 v) {
                    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                                     -0.577350269189626, 0.024390243902439);
                    vec2 i  = floor(v + dot(v, C.yy));
                    vec2 x0 = v - i + dot(i, C.xx);
                    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
                    vec4 x12 = x0.xyxy + C.xxzz;
                    x12.xy -= i1;
                    i = mod(i, 289.0);
                    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
                    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
                    m = m*m;
                    m = m*m;
                    vec3 x = 2.0 * fract(p * C.www) - 1.0;
                    vec3 h = abs(x) - 0.5;
                    vec3 ox = floor(x + 0.5);
                    vec3 a0 = x - ox;
                    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
                    vec3 g;
                    g.x = a0.x * x0.x + h.x * x0.y;
                    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
                    return 130.0 * dot(m, g);
                }
                
                void main() {
                    // Water effect with simplex noise
                    float noise = snoise(vec2(
                        vUv.x * uDensity + uTime * 0.05, 
                        vUv.y * uDensity - uTime * uSpeed
                    ));
                    noise = (noise + 1.0) / 2.0;
                    
                    // Create gradient with noise
                    float strength = noise * uStrength;
                    float gradient = (vUv.y + strength) * uBrightness;
                    
                    // Mix colors
                    vec3 color = mix(uColor1, uColor2, gradient);
                    color = mix(color, uColor3, noise * uReflection);
                    
                    gl_FragColor = vec4(color, 1.0);
                }
            `
        });
        
        // Create a plane that fills the view
        const geometry = new THREE.PlaneGeometry(20, 20);
        const plane = new THREE.Mesh(geometry, material);
        plane.rotation.x = Math.PI * 0.25; // 45 degrees
        plane.position.set(0, 1.2, -0.3);
        scene.add(plane);
        
        // Animation loop
        function animate() {
            requestAnimationFrame(animate);
            uniforms.uTime.value += 0.005;
            renderer.render(scene, camera);
        }
        
        // Start animation
        animate();
        
        // Handle window resize
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }
})();