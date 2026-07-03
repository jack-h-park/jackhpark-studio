import { useEffect, useRef, useState } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from "three";

import styles from "../landing.module.css";
import { readBrandStops, sampleGradient } from "./gradientStops";

/**
 * Persistent page-wide atmosphere: ONE fixed full-viewport canvas whose
 * particle cloud drifts and slowly resolves with overall page progress —
 * scattered cloud (hero) → twisted ring (mid-page) → looser grid (end).
 * A faint accent behind the whole page, above the CSS mesh, below content.
 *
 * Desktop-only and skipped under prefers-reduced-motion; the hero
 * ParticleField + CSS mesh carry the atmosphere there.
 */

const VERTEX_SHADER = /* glsl */ `
  attribute float aPhase;
  attribute float aSize;
  attribute vec3 aColor;
  attribute vec3 aPosB;
  attribute vec3 aPosC;
  uniform float uTime;
  uniform float uProgress;
  uniform float uDrift;
  uniform float uMorph;
  uniform vec2 uParallax;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vColor = aColor;
    // Piecewise morph: cloud -> ring over [0, .5], ring -> grid over [.5, 1].
    // uMorph scales how far the shapes resolve — ambient stays cloud-like.
    float prog = uProgress * uMorph;
    float t1 = smoothstep(0.0, 0.5, prog);
    float t2 = smoothstep(0.5, 1.0, prog);
    vec3 p = mix(mix(position, aPosB, t1), aPosC, t2);
    // Structure = stillness: drift fades as the grid locks in.
    float drift = mix(1.0, 0.12, prog) * uDrift;
    p.y += sin(uTime * 0.26 + aPhase) * 0.5 * drift;
    p.x += cos(uTime * 0.16 + aPhase * 1.7) * 0.4 * drift;
    p.z += sin(uTime * 0.2 + aPhase * 2.3) * 0.35 * drift;
    vec4 mv = modelViewMatrix * vec4(p + vec3(uParallax, 0.0), 1.0);
    gl_PointSize = aSize * (300.0 / -mv.z);
    vAlpha = smoothstep(-20.0, -5.0, mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;
  uniform float uAlpha;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.1, d) * uAlpha * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

// The atmospheric persistence layer — a whisper: fewer, fainter points so
// the field never competes with body text even where the cloud is densest
// (behind the full-width Chain). The mesh + tint carry the atmosphere;
// particles are an accent, only partly resolving so it reads as a
// background cloud rather than a set-piece.
const FIELD = {
  count: 950,
  alpha: 0.05,
  drift: 0.7,
  morph: 0.55,
  parallax: 0.45,
};

function buildGeometry(count: number, container: HTMLElement): BufferGeometry {
  const stops = readBrandStops(container);
  const posA = new Float32Array(count * 3); // cloud
  const posB = new Float32Array(count * 3); // twisted ring
  const posC = new Float32Array(count * 3); // grid
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);

  // Deterministic pseudo-random keeps re-mounts (vibe toggling) consistent.
  let seed = 4242;
  const rand = () => {
    seed = (seed * 16_807) % 2_147_483_647;
    return seed / 2_147_483_647;
  };
  const gauss = () => (rand() + rand() + rand() + rand() - 2) / 2;

  const cols = Math.ceil(Math.sqrt(count * 1.8));
  const rows = Math.ceil(count / cols);

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);

    // A · cloud: page-wide loose volume.
    posA[i * 3] = gauss() * 10;
    posA[i * 3 + 1] = gauss() * 6;
    posA[i * 3 + 2] = gauss() * 5;

    // B · ring: a twisted band — the chain motif. Angle from t so the
    // gradient wraps the ring in brand order.
    const angle = t * Math.PI * 2;
    const twist = Math.sin(angle * 3) * 0.9;
    const radius = 5.6 + gauss() * 0.5;
    posB[i * 3] = Math.cos(angle) * radius;
    posB[i * 3 + 1] = Math.sin(angle) * radius * 0.55 + twist;
    posB[i * 3 + 2] = Math.sin(angle * 2) * 1.6 + gauss() * 0.3;

    // C · grid: ordered rows/columns, gradient sweeping left -> right.
    const col = i % cols;
    const row = Math.floor(i / cols);
    posC[i * 3] = (col / (cols - 1) - 0.5) * 17;
    posC[i * 3 + 1] = (row / Math.max(rows - 1, 1) - 0.5) * 9;
    posC[i * 3 + 2] = gauss() * 0.15;

    const color = sampleGradient(stops, t);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;

    phases[i] = rand() * Math.PI * 2;
    sizes[i] = 0.45 + rand() * 1.0;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(posA, 3));
  geometry.setAttribute("aPosB", new BufferAttribute(posB, 3));
  geometry.setAttribute("aPosC", new BufferAttribute(posC, 3));
  geometry.setAttribute("aColor", new BufferAttribute(colors, 3));
  geometry.setAttribute("aPhase", new BufferAttribute(phases, 1));
  geometry.setAttribute("aSize", new BufferAttribute(sizes, 1));
  return geometry;
}

export function MorphField() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Desktop-only. Mobile / reduced-motion get the hero ParticleField +
    // CSS mesh instead — never this canvas.
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (reducedMotion || isMobile) return;

    const config = FIELD;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ alpha: true, antialias: false });
    } catch {
      // No WebGL — the CSS mesh remains the background.
      return;
    }

    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1, 0.1, 80);
    camera.position.z = 13;

    const geometry = buildGeometry(config.count, container);
    const material = new ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uDrift: { value: config.drift },
        uMorph: { value: config.morph },
        uAlpha: { value: config.alpha },
        uParallax: { value: [0, 0] },
      },
    });
    scene.add(new Points(geometry, material));

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.append(renderer.domElement);

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      if (!clientWidth || !clientHeight) return;
      renderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    };
    resize();

    const parallaxTarget = { x: 0, y: 0 };
    const onPointerMove = (event: PointerEvent) => {
      parallaxTarget.x =
        (event.clientX / window.innerWidth - 0.5) * 2.2 * config.parallax;
      parallaxTarget.y =
        (0.5 - event.clientY / window.innerHeight) * 1.4 * config.parallax;
    };

    let rafId = 0;
    let running = false;
    const start = performance.now();

    const loop = () => {
      const uniforms = material.uniforms;
      if (uniforms.uTime) {
        uniforms.uTime.value = (performance.now() - start) / 1000;
      }
      if (uniforms.uProgress) {
        // Overall page progress drives the morph; lerped for inertia.
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const target = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
        const current = uniforms.uProgress.value as number;
        uniforms.uProgress.value = current + (target - current) * 0.06;
      }
      const parallax = material.uniforms.uParallax;
      if (parallax) {
        const value = parallax.value as [number, number];
        value[0] += (parallaxTarget.x - value[0]) * 0.06;
        value[1] += (parallaxTarget.y - value[1]) * 0.06;
      }
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(loop);
    };

    // The canvas is fixed (always "in view"), so only tab visibility gates it.
    const syncLoop = () => {
      const shouldRun = !document.hidden;
      if (shouldRun && !running) {
        running = true;
        rafId = requestAnimationFrame(loop);
      } else if (!shouldRun && running) {
        running = false;
        cancelAnimationFrame(rafId);
      }
    };

    const onVisibility = () => syncLoop();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove);

    renderer.render(scene, camera);
    setReady(true);
    syncLoop();

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`${styles.morphCanvas} ${ready ? styles.morphCanvasVisible : ""}`}
      aria-hidden="true"
    />
  );
}
