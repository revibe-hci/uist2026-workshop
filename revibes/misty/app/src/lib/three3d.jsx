// 3D remix: components that generated UI code can use to build live 3D with
// three.js (through @react-three/fiber). They are loaded only when a UI's code
// uses them (see CodeRender), so 2D blends do not pay for three.js.
import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, extend, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SceneErrorContext } from './sceneError.js';

extend({ RoundedBoxGeometry });

// Errors inside a 3D scene stay inside its box and are reported to the node,
// so the rest of the UI keeps rendering and Fix Render still sees the error.
class SceneBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    this.props.onError?.(`3D scene: ${error?.message || error}`);
  }
  render() {
    if (this.state.error) {
      return <div className="m-3d-error">3D could not render: {String(this.state.error.message || this.state.error)}</div>;
    }
    return this.props.children;
  }
}

function DragToRotate({ autoRotate, speed }) {
  const { camera, gl } = useThree();
  const controls = useMemo(() => new OrbitControls(camera, gl.domElement), [camera, gl]);
  useEffect(() => {
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = speed;
    return () => controls.dispose();
  }, [controls, autoRotate, speed]);
  useFrame(() => controls.update());
  return null;
}

// A 3D viewport inside the UI. Give it a size with className (e.g. "h-48 w-full").
export function Scene3D({
  children,
  className = '',
  style,
  camera = [0, 0, 5],
  fov = 45,
  controls = true,
  autoRotate = false,
  autoRotateSpeed = 2,
  lights = true,
  background,
}) {
  const report = React.useContext(SceneErrorContext);
  const position = Array.isArray(camera) ? camera : [0, 0, 5];
  return (
    <div className={`m-scene3d ${className}`} style={{ position: 'relative', minHeight: 96, ...style }}>
      <SceneBoundary onError={report}>
        <Canvas
          dpr={[1, 2]}
          camera={{ position, fov }}
          gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
          // Measure the untransformed size: the canvas sits inside zoomed React Flow nodes,
          // where the on-screen size is scaled and would shrink the scene into a corner.
          resize={{ offsetSize: true, scroll: false }}
          style={{ position: 'absolute', inset: 0 }}
        >
          {background && <color attach="background" args={[background]} />}
          {lights && (
            <>
              <ambientLight intensity={0.55} />
              <hemisphereLight args={['#ffffff', '#3b4252', 0.7]} />
              <directionalLight position={[3, 5, 4]} intensity={1.6} />
              <directionalLight position={[-4, -2, -3]} intensity={0.45} />
            </>
          )}
          <Suspense fallback={null}>{children}</Suspense>
          {controls && <DragToRotate autoRotate={autoRotate} speed={autoRotateSpeed} />}
        </Canvas>
      </SceneBoundary>
    </div>
  );
}

// Rotates its children continuously around one axis.
export function Spin({ children, speed = 0.6, axis = 'y' }) {
  const ref = useRef();
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation[axis] += delta * speed;
  });
  return <group ref={ref}>{children}</group>;
}

// Makes its children bob up and down gently.
export function Float3D({ children, speed = 1, height = 0.15 }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = Math.sin(clock.elapsedTime * speed * 1.5) * height;
  });
  return <group ref={ref}>{children}</group>;
}

// A box with rounded edges, for 3D cards, tiles and buttons. Put a material inside.
export function RoundedBox({ args = [1, 1, 1], radius = 0.1, segments = 4, children, ...props }) {
  const [width, height, depth] = args;
  return (
    <mesh {...props}>
      <roundedBoxGeometry args={[width, height, depth, segments, radius]} />
      {children || <meshStandardMaterial color="#cccccc" />}
    </mesh>
  );
}

// Names generated code may use. useFrame and THREE allow custom animation.
export const threeScope = { Scene3D, Spin, Float3D, RoundedBox, useFrame, THREE };
