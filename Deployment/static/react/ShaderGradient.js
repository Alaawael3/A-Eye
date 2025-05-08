import * as THREE from 'three';
import { useRef, useEffect } from 'react';

// ShaderGradient component using the official library
const ShaderGradient = () => {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: -1 }}>
      <window.ShaderGradientCanvas
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%'
        }}
      >
        <window.ShaderGradientComponent 
          urlString="https://www.shadergradient.co/customize?animate=on&axesHelper=off&bgColor1=%23000000&bgColor2=%23000000&brightness=1.2&cAzimuthAngle=180&cDistance=5&cPolarAngle=40&cameraZoom=1&color1=%23ff7073&color2=%238591ff&color3=%23ffffff&embedMode=off&envPreset=city&fov=40&gizmoHelper=hide&grain=off&lightType=3d&pixelDensity=1&positionX=0&positionY=1.2&positionZ=-0.3&reflection=0.1&rotationX=45&rotationY=0&rotationZ=0&shader=defaults&type=waterPlane&uAmplitude=0&uDensity=1.2&uFrequency=0&uSpeed=0.2&uStrength=1.5&uTime=0&wireframe=false"
        />
      </window.ShaderGradientCanvas>
    </div>
  );
};

export default ShaderGradient;