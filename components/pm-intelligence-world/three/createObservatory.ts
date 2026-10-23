import {
  ACESFilmicToneMapping,
  AmbientLight,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  type Material,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  OrthographicCamera,
  PCFShadowMap,
  PointLight,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import type { InputId } from "@/content/pm-intelligence-world/types";
import {
  type ObservatoryLocation,
  observatoryLocations,
  type ObservatoryState,
} from "@/lib/pm-intelligence-world/observatory-state";

import { createSourceCapsule, createVisitor } from "./observatoryProps";

export interface ObservatoryHandle {
  setState(state: ObservatoryState): void;
  home(): void;
  dispose(): void;
}
export function createObservatory({
  mount,
  labels,
  onSelect,
  onMove,
  onReady,
  onError,
}: {
  mount: HTMLDivElement;
  labels: Partial<Record<ObservatoryLocation, HTMLElement>>;
  onSelect: (id: InputId) => void;
  onMove: (id: ObservatoryLocation) => void;
  onReady: () => void;
  onError: () => void;
}): ObservatoryHandle {
  const scene = new Scene();
  scene.background = new Color("#101a3b");
  const camera = new OrthographicCamera(-20, 20, 12, -12, 0.1, 180);
  camera.position.set(23, 25, 36);
  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.domElement.setAttribute("aria-hidden", "true");
  mount.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 2.6, 1.2);
  controls.enablePan = false;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = 1.28;
  controls.minZoom = 0.75;
  controls.maxZoom = 1.8;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.mouseButtons.LEFT = 0;
  scene.add(new HemisphereLight("#8b9cfa", "#101029", 0.85));
  scene.add(new AmbientLight("#6478bd", 0.12));
  const moon = new DirectionalLight("#a7b2ff", 1.6);
  moon.position.set(-12, 25, 15);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -22;
  moon.shadow.camera.right = 22;
  moon.shadow.camera.top = 22;
  moon.shadow.camera.bottom = -22;
  moon.shadow.normalBias = 0.08;
  moon.shadow.bias = -0.0003;
  scene.add(moon);
  const rim = new DirectionalLight("#f6b67e", 1.0);
  rim.position.set(7, 12, -9);
  scene.add(rim);
  for (const [x, y, z] of [
    [-2, 2.2, 7.5],
    [5.3, 3.4, 6.1],
    [0, 5.5, -0.4],
    [-8, 6.6, -5.4],
    [7, 6.6, -5.5],
  ]) {
    const lamp = new PointLight("#ffc27d", 7, 5, 2);
    lamp.position.set(x, y, z);
    scene.add(lamp);
  }
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new Vector2(800, 600), 0.23, 0.4, 1.1));
  composer.addPass(new OutputPass());
  let disposed = false,
    ready = false,
    visible = !document.hidden;
  let motion = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  controls.enableDamping = motion;
  let state: ObservatoryState = {
    location: "signals",
    selected: null,
    inspected: [],
    reviewed: [],
    connected: [],
  };
  let loadedModel: Group | null = null;
  const texture = new TextureLoader().load(
    "/experiences/pm-intelligence/observatory/sky.webp",
    (t) => {
      if (disposed) {
        t.dispose();
        return;
      }
      t.colorSpace = SRGBColorSpace;
      scene.background = t;
    },
  );
  new GLTFLoader().load(
    "/experiences/pm-intelligence/observatory/campus.glb",
    (g) => {
      if (disposed) {
        disposeGroup(g.scene);
        return;
      }
      loadedModel = g.scene;
      g.scene.traverse((o) => {
        if (o instanceof Mesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      scene.add(g.scene);
      ready = true;
      onReady();
    },
    undefined,
    () => {
      if (!disposed) onError();
    },
  );

  // Interactive source capsules and the visitor are actual animated geometry.
  const ids: InputId[] = [
    "external-signals",
    "hands-on-projects",
    "market-study",
  ];
  const colors = ["#65dcf4", "#ffc577", "#c19aff"];
  const capsules = ids.map((id, i) => createSourceCapsule(id, colors[i]));
  const targets: Mesh[] = [];
  for (const [i, capsule] of capsules.entries()) {
    capsule.group.position.set(-2.2 + i * 2, 1.9, 7.6);
    scene.add(capsule.group);
    targets.push(...capsule.pickables);
  }
  const interactionMaterial = new MeshBasicMaterial({ visible: false });
  for (const location of observatoryLocations) {
    const volume = new Mesh(
      new CylinderGeometry(
        location.id === "knowledge" ? 3.1 : 1.35,
        location.id === "knowledge" ? 3.1 : 1.35,
        location.id === "knowledge" ? 6 : 2.2,
        12,
      ),
      interactionMaterial,
    );
    volume.position.set(
      location.anchor[0],
      location.anchor[1] - (location.id === "knowledge" ? 4.5 : 1.5),
      location.anchor[2],
    );
    volume.userData.location = location.id;
    volume.name = `Interaction volume / ${location.label}`;
    scene.add(volume);
    targets.push(volume);
  }
  const { actor, legs, arms } = createVisitor();
  scene.add(actor);
  actor.position.set(-1, 0.5, 9.4);
  // Navigation follows authored walkways, not a straight line through cliffs.
  const hub = new Vector3(-1, 0.5, 7);
  const stairs = new Vector3(-1, 3.8, 1);
  const upper = new Vector3(0, 3.8, -3.5);
  const route = (id: ObservatoryLocation) => {
    const dest = new Vector3(
      ...observatoryLocations.find((l) => l.id === id)!.position,
    );
    if (id === "signals") return [hub, dest];
    if (id === "review") return [hub, new Vector3(1.2, 0.5, 7), dest];
    if (id === "knowledge") return [hub, stairs];
    if (id === "writing")
      return [hub, stairs, upper, new Vector3(-3, 3.8, -5.8), dest];
    if (id === "questions")
      return [hub, stairs, upper, new Vector3(3, 3.8, -5.8), dest];
    if (id === "learning")
      return [hub, stairs, upper, new Vector3(3, 3.8, -2), dest];
    return [
      hub,
      stairs,
      upper,
      new Vector3(3, 3.8, -2),
      new Vector3(8, 3.3, -1.5),
      new Vector3(8, 3.3, 1),
      dest,
    ];
  };
  let remaining: Vector3[] = [];
  let previousLocation: ObservatoryLocation = "signals";
  const visit = (id: ObservatoryLocation) => {
    const reverse = route(previousLocation).slice(0, -1).toReversed();
    remaining = [...reverse, ...route(id)];
    previousLocation = id;
    if (!motion) {
      actor.position.copy(remaining.at(-1)!);
      remaining = [];
    }
  };
  const lineMaterial = new MeshBasicMaterial({
    color: "#67e6e2",
    transparent: true,
    opacity: 0.65,
  });
  const connections = new Group();
  scene.add(connections);
  const connectionNodes: Vector3[] = [];
  for (const l of observatoryLocations.filter((l) =>
    ["writing", "questions", "learning", "decisions"].includes(l.id),
  )) {
    const pts = route(l.id).slice(2);
    for (let j = 0; j < pts.length - 1; j++) {
      const start = pts[j].clone();
      const end = pts[j + 1].clone();
      const n = Math.ceil(start.distanceTo(end) / 0.45);
      for (let k = 0; k < n; k++)
        connectionNodes.push(
          start
            .clone()
            .lerp(end, k / n)
            .add(new Vector3(0.25, 0.18, 0)),
        );
    }
  }
  for (const pos of connectionNodes) {
    const dot = new Mesh(new SphereGeometry(0.045, 5, 4), lineMaterial);
    dot.position.copy(pos);
    connections.add(dot);
  }
  connections.visible = false;
  const starGeometry = new BufferGeometry();
  const starData: number[] = [];
  let seed = 9;
  const random = () => {
    seed = (seed * 16_807) % 2_147_483_647;
    return seed / 2_147_483_647;
  };
  for (let i = 0; i < 100; i++)
    starData.push(
      (random() - 0.5) * 70,
      random() * 15 + 15,
      (random() - 0.5) * 50 - 15,
    );
  starGeometry.setAttribute(
    "position",
    new Float32BufferAttribute(starData, 3),
  );
  scene.add(
    new Points(
      starGeometry,
      new PointsMaterial({
        color: "#d6dcff",
        size: 0.045,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.65,
      }),
    ),
  );
  const ray = new Raycaster(),
    pointer = new Vector2();
  let down: [number, number] | null = null;
  let hoveredInput: InputId | null = null;
  const pickAt = (event: PointerEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    return ray.intersectObjects(targets)[0];
  };
  const updateHover = (event?: PointerEvent) => {
    const hit = event && !down ? pickAt(event) : undefined;
    hoveredInput = (hit?.object.userData.input as InputId | undefined) || null;
    const place = hit?.object.userData.location as
      | ObservatoryLocation
      | undefined;
    for (const location of observatoryLocations) {
      const label = labels[location.id];
      if (label) label.dataset.hovered = String(place === location.id);
    }
    renderer.domElement.style.cursor = down
      ? "grabbing"
      : hit
        ? "pointer"
        : "grab";
    renderer.domElement.dataset.hovered = hoveredInput || place || "";
  };
  const pointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    down = [event.clientX, event.clientY];
    updateHover();
  };
  const pointerMove = (event: PointerEvent) => updateHover(event);
  const pointerUp = (event: PointerEvent) => {
    const start = down;
    down = null;
    updateHover(event);
    if (
      !start ||
      Math.hypot(event.clientX - start[0], event.clientY - start[1]) > 6
    )
      return;
    const hit = pickAt(event);
    if (hit?.object.userData.input)
      onSelect(hit.object.userData.input as InputId);
    else if (hit?.object.userData.location)
      onMove(hit.object.userData.location as ObservatoryLocation);
  };
  const pointerCancel = () => {
    down = null;
    updateHover();
  };
  renderer.domElement.addEventListener("pointerdown", pointerDown);
  renderer.domElement.addEventListener("pointermove", pointerMove);
  renderer.domElement.addEventListener("pointerup", pointerUp);
  renderer.domElement.addEventListener("pointercancel", pointerCancel);
  renderer.domElement.addEventListener("pointerleave", pointerCancel);
  const contextLost = (e: Event) => {
    e.preventDefault();
    onError();
  };
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  const changeMotion = () => {
    motion = !media.matches;
    controls.enableDamping = motion;
    if (!motion && cameraTour) {
      const shift = cameraTour.target.clone().sub(controls.target);
      camera.position.add(shift);
      controls.target.copy(cameraTour.target);
      camera.zoom = cameraTour.zoom;
      camera.updateProjectionMatrix();
      cameraTour = null;
    }
    if (!motion && remaining.length) {
      actor.position.copy(remaining.at(-1)!);
      remaining = [];
    }
  };
  media.addEventListener("change", changeMotion);
  const changeVisible = () => {
    visible = !document.hidden;
  };
  document.addEventListener("visibilitychange", changeVisible);
  let cameraTour: { target: Vector3; zoom: number } | null = null;
  const stopTour = () => {
    cameraTour = null;
  };
  controls.addEventListener("start", stopTour);
  const framePlace = (id: ObservatoryLocation) => {
    const l = observatoryLocations.find((place) => place.id === id)!;
    cameraTour = {
      target: new Vector3(...l.position).add(
        new Vector3(0, id === "knowledge" ? 2.3 : 1.5, 0),
      ),
      zoom: id === "signals" ? 1.6 : id === "knowledge" ? 1.3 : 1.45,
    };
    if (!motion) {
      const shift = cameraTour.target.clone().sub(controls.target);
      camera.position.add(shift);
      controls.target.copy(cameraTour.target);
      camera.zoom = cameraTour.zoom;
      camera.updateProjectionMatrix();
      cameraTour = null;
    }
  };
  const projected = new Vector3();
  let width = 1,
    height = 1;
  const resize = () => {
    width = mount.clientWidth;
    height = mount.clientHeight;
    const aspect = width / height;
    const span = aspect < 1 ? 28 : Math.max(36, aspect * 24.5);
    camera.left = -span / 2;
    camera.right = span / 2;
    camera.top = span / aspect / 2;
    camera.bottom = -span / aspect / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer.setSize(width, height);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(mount);
  resize();
  let elapsed = 0,
    last = 0;
  renderer.setAnimationLoop((ms) => {
    if (disposed || !visible) return;
    const delta = Math.min((ms - last) / 1000, 0.05);
    last = ms;
    if (motion) elapsed += delta;
    if (cameraTour) {
      const blend = 1 - Math.exp(-delta * 2.2);
      const shift = cameraTour.target
        .clone()
        .sub(controls.target)
        .multiplyScalar(blend);
      controls.target.add(shift);
      camera.position.add(shift);
      camera.zoom += (cameraTour.zoom - camera.zoom) * blend;
      camera.updateProjectionMatrix();
      if (
        shift.length() < 0.001 &&
        Math.abs(camera.zoom - cameraTour.zoom) < 0.001
      )
        cameraTour = null;
    }
    controls.update();
    if (motion && remaining.length) {
      const target = remaining[0];
      const diff = target.clone().sub(actor.position);
      const distance = diff.length();
      if (distance < 0.08) remaining.shift();
      else {
        actor.position.addScaledVector(
          diff.normalize(),
          Math.min(distance, delta * 5),
        );
        actor.rotation.y = Math.atan2(diff.x, diff.z);
      }
    }
    for (const [i, leg] of legs.entries()) {
      leg.rotation.x =
        remaining.length && motion
          ? Math.sin(elapsed * 12 + i * Math.PI) * 0.45
          : 0;
    }
    for (const [i, arm] of arms.entries()) {
      arm.rotation.x =
        remaining.length && motion
          ? -Math.sin(elapsed * 12 + i * Math.PI) * 0.3
          : 0;
    }
    for (const [i, capsule] of capsules.entries()) {
      const g = capsule.group;
      const stored = state.connected.includes(ids[i]);
      const carried =
        state.selected === ids[i] &&
        state.inspected.includes(ids[i]) &&
        !stored;
      const destination = stored
        ? new Vector3(-0.8 + i * 0.8, 8.6, -2.5)
        : carried
          ? actor.localToWorld(new Vector3(0.38, 0.85, 0.1))
          : new Vector3(
              -2.2 + i * 2,
              1.95 + (motion ? Math.sin(elapsed * 1.7 + i) * 0.12 : 0),
              7.6,
            );
      g.position.lerp(destination, motion ? 1 - Math.exp(-delta * 3) : 1);
      g.rotation.y = elapsed * 0.22;
      capsule.frameMaterial.emissiveIntensity =
        state.selected === ids[i] || hoveredInput === ids[i] ? 0.28 : 0.04;
      g.scale.setScalar(
        stored
          ? 0.55
          : carried
            ? 0.45
            : state.selected === ids[i]
              ? 1.15
              : hoveredInput === ids[i]
                ? 1.1
                : 1,
      );
    }
    for (const location of observatoryLocations) {
      const el = labels[location.id];
      if (!el) continue;
      projected
        .set(location.anchor[0], location.anchor[1], location.anchor[2])
        .project(camera);
      el.style.left = `${(projected.x * 0.5 + 0.5) * width}px`;
      el.style.top = `${(-projected.y * 0.5 + 0.5) * height}px`;
      el.style.visibility =
        ready && Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1
          ? "visible"
          : "hidden";
    }
    composer.render();
  });
  function disposeGroup(group: Object3D) {
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    const textures = new Set<Texture>();
    const bitmaps = new Set<ImageBitmap>();
    group.traverse((object) => {
      if (!(object instanceof Mesh || object instanceof Points)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material)) {
          if (!(value instanceof Texture)) continue;
          textures.add(value);
          const image: unknown = value.source.data;
          if (
            typeof ImageBitmap !== "undefined" &&
            image instanceof ImageBitmap
          )
            bitmaps.add(image);
        }
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    for (const bitmap of bitmaps) bitmap.close();
  }
  return {
    setState(next) {
      if (!next.selected && state.selected) {
        remaining = [];
        actor.position.set(-1, 0.5, 9.4);
        previousLocation = "signals";
      }

      if (next.location !== state.location) {
        visit(next.location);
        framePlace(next.location);
      } else if (next.selected && next.selected !== state.selected)
        framePlace("signals");
      state = next;
      connections.visible = next.connected.length > 0;
    },
    home() {
      cameraTour = null;
      camera.position.set(23, 25, 36);
      controls.target.set(0, 2.6, 1.2);
      camera.zoom = 1;
      camera.updateProjectionMatrix();
      controls.update();
    },
    dispose() {
      disposed = true;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      document.removeEventListener("visibilitychange", changeVisible);
      media.removeEventListener("change", changeMotion);
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("pointercancel", pointerCancel);
      renderer.domElement.removeEventListener("pointerleave", pointerCancel);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      controls.removeEventListener("start", stopTour);
      controls.dispose();
      if (loadedModel) scene.remove(loadedModel);
      disposeGroup(scene);
      if (loadedModel) disposeGroup(loadedModel);
      texture.dispose();
      for (const pass of composer.passes) pass.dispose();
      composer.dispose();
      moon.shadow.map?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
