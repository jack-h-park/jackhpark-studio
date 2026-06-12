import { useEffect, useRef, useState } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from "three";

import styles from "../landing.module.css";

// Brand gradient stops at the positions used by --gradient-full (storyboard §5).
const GRADIENT_STOPS: ReadonlyArray<{ token: string; at: number }> = [
  { token: "--brand-pink", at: 0 },
  { token: "--brand-purple", at: 0.3 },
  { token: "--brand-blue", at: 0.6 },
  { token: "--brand-cyan", at: 1 },
];

const VERTEX_SHADER = /* glsl */ `
  attribute float aPhase;
  attribute float aSize;
  attribute vec3 aColor;
  attribute vec3 aScatter;
  uniform float uTime;
  uniform float uConverge;
  uniform vec2 uParallax;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vColor = aColor;
    // The narrative: scattered cloud at rest, converging into the ordered
    // bar (the monogram hyphen) as the visitor scrolls — structure forming.
    vec3 p = position + aScatter * (1.0 - uConverge);
    float drift = mix(1.0, 0.25, uConverge);
    p.y += sin(uTime * 0.3 + aPhase) * 0.4 * drift;
    p.x += cos(uTime * 0.18 + aPhase * 1.7) * 0.3 * drift;
    p.z += sin(uTime * 0.22 + aPhase * 2.3) * 0.3 * drift;
    vec4 mv = modelViewMatrix * vec4(p + vec3(uParallax, 0.0), 1.0);
    gl_PointSize = aSize * (320.0 / -mv.z);
    vAlpha = smoothstep(-16.0, -4.0, mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.08, d) * 0.5 * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

function readBrandStops(el: HTMLElement): Array<{ color: Color; at: number }> {
  const cs = getComputedStyle(el);
  return GRADIENT_STOPS.map(({ token, at }) => ({
    color: new Color(cs.getPropertyValue(token).trim() || "#888888"),
    at,
  }));
}

function sampleGradient(
  stops: Array<{ color: Color; at: number }>,
  t: number,
): Color {
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1];
    const next = stops[i];
    if (prev && next && t <= next.at) {
      const local = (t - prev.at) / (next.at - prev.at);
      return prev.color.clone().lerp(next.color, Math.min(Math.max(local, 0), 1));
    }
  }
  const last = stops.at(-1);
  return last ? last.color.clone() : new Color("#888888");
}

/**
 * Particle band abstracted from the JP monogram's horizontal bar: a loose
 * diagonal ribbon of points, tinted by the 4-stop brand gradient along x
 * (storyboard scene 0 / §5). Drift + mouse parallax; the gradient logo
 * "do not animate" rule applies to the mark, not this background object.
 */
function buildGeometry(
  count: number,
  stops: Array<{ color: Color; at: number }>,
): BufferGeometry {
  const positions = new Float32Array(count * 3);
  const scatters = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);

  // Deterministic pseudo-random keeps SSR/CSR and re-mounts consistent.
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16_807) % 2_147_483_647;
    return seed / 2_147_483_647;
  };
  const gauss = () => (rand() + rand() + rand() + rand() - 2) / 2;

  for (let i = 0; i < count; i++) {
    const t = rand();
    const x = (t - 0.5) * 19;
    // `position` is the CONVERGED state: a tight diagonal bar echoing the
    // monogram hyphen. `aScatter` is each particle's loose-cloud offset.
    positions[i * 3] = x;
    positions[i * 3 + 1] = x * 0.16 + gauss() * 0.18;
    positions[i * 3 + 2] = gauss() * 0.4;

    scatters[i * 3] = gauss() * 1.4;
    scatters[i * 3 + 1] = gauss() * 2.4;
    scatters[i * 3 + 2] = gauss() * 3.2;

    const color = sampleGradient(stops, t);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;

    phases[i] = rand() * Math.PI * 2;
    sizes[i] = 0.5 + rand() * 1.1;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aScatter", new BufferAttribute(scatters, 3));
  geometry.setAttribute("aColor", new BufferAttribute(colors, 3));
  geometry.setAttribute("aPhase", new BufferAttribute(phases, 1));
  geometry.setAttribute("aSize", new BufferAttribute(sizes, 1));
  return geometry;
}

export function ParticleField() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ alpha: true, antialias: false });
    } catch {
      // No WebGL — the CSS wash behind the canvas remains the hero visual.
      return;
    }

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    const count = isMobile ? 800 : 3000;

    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1, 0.1, 60);
    camera.position.z = 11;

    const geometry = buildGeometry(count, readBrandStops(container));
    const material = new ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uConverge: { value: 0 },
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

    const renderFrame = () => renderer.render(scene, camera);

    // Mouse parallax target, lerped per frame (desktop, motion allowed only).
    const parallaxTarget = { x: 0, y: 0 };
    const parallax = material.uniforms.uParallax;
    const onPointerMove = (event: PointerEvent) => {
      parallaxTarget.x = (event.clientX / window.innerWidth - 0.5) * 1.2;
      parallaxTarget.y = (0.5 - event.clientY / window.innerHeight) * 0.8;
    };

    let rafId = 0;
    let running = false;
    let inView = true;
    const start = performance.now();

    const loop = () => {
      const uniforms = material.uniforms;
      if (uniforms.uTime) {
        uniforms.uTime.value = (performance.now() - start) / 1000;
      }
      // Structure forms as the hero scrolls away (lerped for inertia).
      if (uniforms.uConverge) {
        const target = Math.min(window.scrollY / window.innerHeight, 1);
        const current = uniforms.uConverge.value as number;
        uniforms.uConverge.value = current + (target - current) * 0.08;
      }
      if (parallax) {
        const value = parallax.value as [number, number];
        value[0] += (parallaxTarget.x - value[0]) * 0.04;
        value[1] += (parallaxTarget.y - value[1]) * 0.04;
      }
      renderFrame();
      rafId = requestAnimationFrame(loop);
    };

    const syncLoop = () => {
      const shouldRun = inView && !document.hidden && !reducedMotion;
      if (shouldRun && !running) {
        running = true;
        rafId = requestAnimationFrame(loop);
      } else if (!shouldRun && running) {
        running = false;
        cancelAnimationFrame(rafId);
      }
    };

    // Stop the rAF loop whenever the hero leaves the viewport.
    const observer = new IntersectionObserver(
      (entries) => {
        inView = entries.some((entry) => entry.isIntersecting);
        syncLoop();
      },
      { threshold: 0.01 },
    );
    observer.observe(container);

    const onVisibility = () => syncLoop();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", resize);
    if (!reducedMotion && !isMobile) {
      window.addEventListener("pointermove", onPointerMove);
    }

    // Always paint one frame so reduced-motion/hidden tabs still get the field.
    renderFrame();
    setReady(true);
    syncLoop();

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
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
      className={`${styles.heroCanvas} ${ready ? styles.heroCanvasVisible : ""}`}
      aria-hidden="true"
    />
  );
}
