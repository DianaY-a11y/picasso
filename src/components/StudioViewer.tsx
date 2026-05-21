"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { OrbitControls, Bounds, useBounds } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";

export type CaptureFn = () => string | null;

type Props = {
  glbUrl: string | null;
  puppetUrl: string | null;
  /** Called once with a function that snapshots the canvas as a PNG data URL. */
  onReady?: (capture: CaptureFn) => void;
};

export function StudioViewer({ glbUrl, puppetUrl, onReady }: Props) {
  const captureRef = useRef<CaptureFn>(() => null);
  const recenterRef = useRef<() => void>(() => {});

  useEffect(() => {
    onReady?.(() => captureRef.current());
  }, [onReady, captureRef]);

  return (
    <div className="w-full aspect-[4/3] rounded-[2px] border border-canvas-edge bg-canvas-deep/40 overflow-hidden relative">
      <Canvas
        camera={{ position: [0, 0, 2.4], fov: 38 }}
        gl={{
          preserveDrawingBuffer: true,
          alpha: true,
          antialias: true,
          toneMapping: THREE.NoToneMapping,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
      >
        <color attach="background" args={[0xf3ead8]} />
        <ambientLight intensity={1.6} />
        <hemisphereLight args={[0xffffff, 0xe9dcbe, 1.1]} />
        <directionalLight position={[3, 4, 3]} intensity={1.4} />
        <directionalLight position={[-3, -1, -3]} intensity={0.6} />

        <Suspense fallback={null}>
          <Bounds fit clip observe margin={1.2}>
            {glbUrl ? (
              <GLBContent url={glbUrl} />
            ) : puppetUrl ? (
              <PuppetCard url={puppetUrl} />
            ) : null}
            <RecenterBridge recenterRef={recenterRef} />
          </Bounds>
        </Suspense>

        <OrbitControls
          makeDefault
          enablePan
          screenSpacePanning
          minDistance={1.2}
          maxDistance={6}
          enableDamping
        />
        <CaptureBridge captureRef={captureRef} />
      </Canvas>
      <button
        type="button"
        onClick={() => recenterRef.current()}
        className="absolute top-2 right-2 display-italic text-[0.78rem] text-ink-soft hover:text-ochre-deep bg-paper/85 border border-canvas-edge rounded-full px-3 py-1 backdrop-blur-sm"
        aria-label="recenter the view"
      >
        recenter
      </button>
    </div>
  );
}

function RecenterBridge({
  recenterRef,
}: {
  recenterRef: React.MutableRefObject<() => void>;
}) {
  const bounds = useBounds();
  useEffect(() => {
    recenterRef.current = () => {
      bounds.refresh().clip().fit();
    };
  }, [bounds, recenterRef]);
  return null;
}

function CaptureBridge({
  captureRef,
}: {
  captureRef: React.MutableRefObject<CaptureFn>;
}) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    captureRef.current = () => {
      try {
        gl.render(scene, camera);
        return gl.domElement.toDataURL("image/png");
      } catch {
        return null;
      }
    };
  }, [gl, scene, camera, captureRef]);
  return null;
}

function GLBContent({ url }: { url: string }) {
  const gltf = useLoader(GLTFLoader, url);

  const scene = useMemo(() => {
    const root = gltf.scene.clone(true);
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.material = mats.map((m) => {
        const src = m as THREE.MeshStandardMaterial & {
          vertexColors?: boolean;
        };
        // Trellis sometimes bakes color into vertex colors instead of a map.
        // Use MeshBasicMaterial so the texture / vertex colors come through
        // exactly as authored, with no PBR shading darkening it.
        const next = new THREE.MeshBasicMaterial({
          map: src.map ?? null,
          color: src.color ?? new THREE.Color(0xffffff),
          vertexColors: !!src.vertexColors,
          transparent: !!src.transparent,
          side: THREE.DoubleSide,
        });
        if (next.map) next.map.colorSpace = THREE.SRGBColorSpace;
        return next;
      });
      if (Array.isArray(mesh.material) && mesh.material.length === 1) {
        mesh.material = mesh.material[0];
      }
    });
    return root;
  }, [gltf]);

  return <primitive object={scene} />;
}

function PuppetCard({ url }: { url: string }) {
  const texture = useLoader(THREE.TextureLoader, url);
  const aspect = useMemo(() => {
    const img = texture.image as HTMLImageElement | undefined;
    if (!img) return 1;
    return img.width / img.height || 1;
  }, [texture]);

  return (
    <group>
      <mesh>
        <planeGeometry args={[aspect, 1]} />
        <meshStandardMaterial
          map={texture}
          transparent
          side={THREE.DoubleSide}
          roughness={0.85}
        />
      </mesh>
    </group>
  );
}
