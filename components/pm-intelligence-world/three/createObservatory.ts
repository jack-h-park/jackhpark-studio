import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  type Group,
  HemisphereLight,
  InstancedMesh,
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
  SRGBColorSpace,
  Texture,
  TextureLoader,
  TorusGeometry,
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
  isPlayDestination,
  type PlayDestination,
} from "@/content/pm-intelligence-world/activities";
import {
  ownsInstrumentPointer,
  shouldOperateInstrument,
} from "@/lib/pm-intelligence-world/instrument-input";
import {
  CameraFramingGate,
  clearPlayfield,
  fitObjectFrame,
  framePoint,
  observatoryZoomLimits,
  type PlayRect,
} from "@/lib/pm-intelligence-world/observatory-framing";
import { expeditionMission } from "@/lib/pm-intelligence-world/observatory-mission";
import {
  nearestDestination,
  planWalk,
  stepWalker,
  type WalkPoint,
} from "@/lib/pm-intelligence-world/observatory-navigation";
import {
  type ObservatoryLocation,
  observatoryLocations,
  type ObservatoryState,
} from "@/lib/pm-intelligence-world/observatory-state";
import {
  clearsSpatialFeedback,
  feedbackTransition,
} from "@/lib/pm-intelligence-world/spatial-feedback";

import { createExpeditionTrail } from "./expeditionTrail";
import { createKnowledgeConnections } from "./knowledgeConnections";
import {
  createDestinationExhibits,
  pickWorldTarget,
} from "./observatoryExhibits";
import { createObservatoryGarden } from "./observatoryGarden";
import {
  createGreenhouseBridge,
  createSourceCapsule,
  createVisitor,
} from "./observatoryProps";
import { prepareObservatoryFrame } from "./prepareObservatoryFrame";
import { readCampus } from "./readCampus";
import { createSpatialFeedback } from "./spatialFeedback";

export interface ObservatoryHandle {
  setMotionPaused(paused: boolean): void;
  setState(state: ObservatoryState): void;
  focusInstrument(id: PlayDestination | null): void;
  home(): void;
  reset(): void;
  setWalking(enabled: boolean, paused: boolean): void;
  walk(input: readonly [number, number]): void;
  nudge(input: readonly [number, number]): void;
  interact(): void;
  dispose(): void;
}
export function createObservatory({
  mount,
  labels,
  onSelect,
  onMove,
  onReady,
  onError,
  onNearby,
  onPosition,
  onOperate,
}: {
  mount: HTMLDivElement;
  labels: Partial<Record<ObservatoryLocation, HTMLElement>>;
  onSelect: (id: InputId) => void;
  onMove: (id: ObservatoryLocation) => void;
  onReady: () => void;
  onError: () => void;
  onNearby: (location: ObservatoryLocation | null) => void;
  onPosition: (position: WalkPoint) => void;
  onOperate: (id: PlayDestination) => void;
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
  controls.minZoom = observatoryZoomLimits.min;
  controls.maxZoom = observatoryZoomLimits.max;
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
    [7, 7.8, -4.3],
  ]) {
    const lamp = new PointLight("#ffc27d", Math.abs(x) > 6 ? 3.8 : 7, 5, 2);
    lamp.position.set(x, y, z);
    scene.add(lamp);
  }
  const inspectionLight = new PointLight("#c4deff", 4, 5, 2);
  inspectionLight.visible = false;
  scene.add(inspectionLight);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new Vector2(800, 600), 0.23, 0.4, 1.1);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  let disposed = false,
    ready = false,
    visible = !document.hidden;
  let motion = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  let motionAllowed = true;
  let needsRender = true;
  const invalidate = () => {
    needsRender = true;
  };
  controls.addEventListener("change", invalidate);
  controls.enableDamping = motion;
  let state: ObservatoryState = {
    travel: 0,
    activities: {},
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
      invalidate();
    },
  );
  const modelRequest = new AbortController();
  void readCampus(modelRequest.signal)
    .then((data) =>
      new GLTFLoader().parseAsync(
        data,
        "/experiences/pm-intelligence/observatory/",
      ),
    )
    .then(
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
        void prepareObservatoryFrame(
          renderer,
          scene,
          camera,
          composer.readBuffer,
          bloom,
        ).then(
          () => {
            if (disposed) return;
            ready = true;
            invalidate();
            onReady();
          },
          () => {
            if (!disposed) onError();
          },
        );
      },
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
  const exhibits = createDestinationExhibits();
  scene.add(exhibits.group, createObservatoryGarden());
  exhibits.update(state);
  exhibits.group.traverse((object) => {
    if (object instanceof Mesh) targets.push(object);
  });
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
  const spatialFeedback = createSpatialFeedback();
  scene.add(spatialFeedback.group);
  const { actor, legs, arms } = createVisitor();
  scene.add(actor);
  scene.add(createGreenhouseBridge());
  actor.position.set(-1, 0.5, 9.4);
  let remaining: Vector3[] = [];
  let walking = false,
    paused = false,
    following = false;
  let virtualInput: readonly [number, number] = [0, 0];
  const keys = new Set<string>();
  let nearby: ObservatoryLocation | null = null;
  const announceNearby = () => {
    onPosition([actor.position.x, actor.position.y, actor.position.z]);
    const next = nearestDestination([
      actor.position.x,
      actor.position.y,
      actor.position.z,
    ]);
    if (next !== nearby) {
      nearby = next;
      onNearby(next);
      if (next) spatialFeedback.arrive(next);
    }
  };
  const clearInput = () => {
    keys.clear();
    virtualInput = [0, 0];
  };
  const interact = () => {
    if (walking && !paused && nearby) onMove(nearby);
  };
  const keyDown = (event: KeyboardEvent) => {
    if (
      !walking ||
      paused ||
      document.activeElement !== mount ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    const key = event.key.toLowerCase();
    if (
      [
        "w",
        "a",
        "s",
        "d",
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
      ].includes(key)
    ) {
      event.preventDefault();
      keys.add(key);
    } else if (key === "e" && !event.repeat) {
      event.preventDefault();
      interact();
    }
  };
  const keyUp = (event: KeyboardEvent) => {
    keys.delete(event.key.toLowerCase());
  };
  mount.addEventListener("keydown", keyDown);
  document.addEventListener("keyup", keyUp);
  mount.addEventListener("blur", clearInput);
  window.addEventListener("blur", clearInput);
  const walkStep = (input: readonly [number, number], delta: number) => {
    if (!walking || paused || !ready) return false;
    const before = actor.position.clone();
    const forward: [number, number] = [
      controls.target.x - camera.position.x,
      controls.target.z - camera.position.z,
    ];
    const next = stepWalker(
      [before.x, before.y, before.z],
      input,
      delta,
      forward,
    );
    actor.position.set(...next);
    const diff = actor.position.clone().sub(before);
    if (diff.lengthSq() < 0.000_001) return false;
    actor.rotation.y = Math.atan2(diff.x, diff.z);
    remaining = [];
    cameraTour = null;
    following = true;
    return true;
  };
  const visit = (id: ObservatoryLocation) => {
    clearInput();
    following = false;
    if (
      nearestDestination([
        actor.position.x,
        actor.position.y,
        actor.position.z,
      ]) === id
    ) {
      remaining = [];
      return;
    }
    remaining = planWalk(
      [actor.position.x, actor.position.y, actor.position.z],
      id,
    ).map((p) => new Vector3(...p));
    if (!motion) {
      actor.position.copy(remaining.at(-1)!);
      remaining = [];
      announceNearby();
    }
  };
  const expeditionTrail = createExpeditionTrail();
  scene.add(expeditionTrail.group);
  expeditionTrail.update([-1, 0.5, 9.4], "signals");
  const beacons = observatoryLocations
    .filter((l) => isPlayDestination(l.id))
    .map((l) => {
      const ring = new Mesh(
        new TorusGeometry(0.65, 0.035, 6, 24),
        new MeshBasicMaterial({
          color: "#69cddd",
          transparent: true,
          opacity: 0.4,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(l.position[0], l.position[1] + 0.08, l.position[2]);
      scene.add(ring);
      return { location: l.id, ring };
    });
  const connections = createKnowledgeConnections();
  scene.add(connections);
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
  let gesture: { id: PlayDestination; pointerId: number } | null = null;
  const frameGate = new CameraFramingGate();
  const endGesture = () => {
    invalidate();
    const resumeFraming = frameGate.end();
    if (resumeFraming)
      queueMicrotask(() => {
        if (!disposed && activeInstrument && frameGate.request())
          frameInstrument(activeInstrument);
      });
    if (!gesture) return;
    exhibits.preview(gesture.id, null);
    if (renderer.domElement.hasPointerCapture(gesture.pointerId))
      renderer.domElement.releasePointerCapture(gesture.pointerId);
    gesture = null;
    controls.enabled = true;
  };
  let down: [number, number] | null = null;
  let hoveredInput: InputId | null = null;
  const pickAt = (event: PointerEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    return pickWorldTarget(ray.intersectObjects(targets));
  };
  const updateHover = (event?: PointerEvent) => {
    invalidate();
    const hit = event && !down ? pickAt(event) : undefined;
    hoveredInput = (hit?.object.userData.input as InputId | undefined) || null;
    const place = hit?.object.userData.location as
      | ObservatoryLocation
      | undefined;
    const operation = hit?.object.userData.operation as
      | PlayDestination
      | undefined;
    exhibits.hover(operation ?? null);
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
    renderer.domElement.dataset.operation = operation || "";
  };
  const pointerDown = (event: PointerEvent) => {
    invalidate();
    if (
      !event.isPrimary ||
      !ownsInstrumentPointer(gesture?.pointerId, event.pointerId)
    )
      return;
    if (event.button !== 0 && event.pointerType === "mouse") return;
    down = [event.clientX, event.clientY];
    const hit = pickAt(event),
      id = hit?.object.userData.operation as PlayDestination | undefined;
    if (id && activeInstrument === id) {
      gesture = { id, pointerId: event.pointerId };
      frameGate.begin();
      controls.enabled = false;
      cameraTour = null;
      renderer.domElement.setPointerCapture(event.pointerId);
      exhibits.preview(id, id === "questions" || id === "decisions" ? 0 : 1);
    }
    updateHover();
  };
  const pointerMove = (event: PointerEvent) => {
    invalidate();
    if (!ownsInstrumentPointer(gesture?.pointerId, event.pointerId)) return;
    if (gesture && down) {
      if (gesture.id === "questions" || gesture.id === "decisions")
        exhibits.preview(gesture.id, (event.clientX - down[0]) / 70);
      return;
    }
    updateHover(event);
  };
  const pointerUp = (event: PointerEvent) => {
    if (!ownsInstrumentPointer(gesture?.pointerId, event.pointerId)) return;
    const start = down;
    if (gesture && start) {
      const id = gesture.id;
      endGesture();
      down = null;
      updateHover(event);
      if (
        shouldOperateInstrument(id, [
          event.clientX - start[0],
          event.clientY - start[1],
        ])
      )
        onOperate(id);
      return;
    }
    down = null;
    updateHover(event);
    if (
      !start ||
      Math.hypot(event.clientX - start[0], event.clientY - start[1]) > 6
    )
      return;
    const hit = pickAt(event);
    if (hit?.object.userData.operation)
      onOperate(hit.object.userData.operation as PlayDestination);
    else if (hit?.object.userData.input)
      onSelect(hit.object.userData.input as InputId);
    else if (hit?.object.userData.location)
      onMove(hit.object.userData.location as ObservatoryLocation);
  };
  const pointerCancel = (event?: Event) => {
    if (
      event instanceof PointerEvent &&
      !ownsInstrumentPointer(gesture?.pointerId, event.pointerId)
    )
      return;
    endGesture();
    down = null;
    updateHover();
  };
  renderer.domElement.addEventListener("pointerdown", pointerDown, true);
  renderer.domElement.addEventListener("pointermove", pointerMove);
  renderer.domElement.addEventListener("pointerup", pointerUp);
  renderer.domElement.addEventListener("pointercancel", pointerCancel);
  renderer.domElement.addEventListener("pointerleave", pointerCancel);
  renderer.domElement.addEventListener("lostpointercapture", pointerCancel);
  window.addEventListener("blur", pointerCancel);
  const contextLost = (e: Event) => {
    e.preventDefault();
    onError();
  };
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  const changeMotion = () => {
    motion = motionAllowed && !media.matches;
    invalidate();
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
    invalidate();
    visible = !document.hidden;
    if (!visible) {
      clearInput();
      endGesture();
    }
  };
  document.addEventListener("visibilitychange", changeVisible);
  let cameraTour: { target: Vector3; zoom: number } | null = null;
  let framedPlace: ObservatoryLocation | null = null;
  const stopTour = () => {
    framedPlace = null;
    frameGate.orbit();
    cameraTour = null;
    following = false;
  };
  controls.addEventListener("start", stopTour);
  const visibleOccluders = (): PlayRect[] => {
    const origin = mount.getBoundingClientRect();
    const section = mount.closest("section");
    return [
      ...(section?.querySelectorAll<HTMLElement>(
        "[data-observatory-header], [data-observatory-panel]",
      ) ?? []),
    ]
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => ({
        left: rect.left - origin.left,
        top: rect.top - origin.top,
        right: rect.right - origin.left,
        bottom: rect.bottom - origin.top,
      }));
  };
  const framePlace = (id: ObservatoryLocation) => {
    invalidate();
    const l = observatoryLocations.find((place) => place.id === id)!;
    framedPlace = id;
    const zoom =
      id === "signals"
        ? width <= 900
          ? 2.4
          : 1.6
        : id === "knowledge"
          ? 1.3
          : 1.45;
    cameraTour = {
      target: framePoint(
        camera,
        new Vector3(...l.position).add(
          new Vector3(0, id === "knowledge" ? 2.3 : 1.5, 0),
        ),
        { width, height },
        clearPlayfield({ width, height }, visibleOccluders()),
        zoom,
      ),
      zoom,
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
  let activeInstrument: PlayDestination | null = null;
  const frameInstrument = (id: PlayDestination) => {
    invalidate();
    const view = exhibits.views.find((v) => v.destination === id)!;
    const bounds = new Box3().setFromObject(view.root).expandByScalar(0.08);
    const frame = fitObjectFrame(
      camera,
      bounds,
      { width, height },
      visibleOccluders(),
    );
    const target = frame.target;
    cameraTour = { target, zoom: frame.zoom };
    if (!motion) {
      const shift = target.clone().sub(controls.target);
      camera.position.add(shift);
      controls.target.copy(target);
      camera.zoom = cameraTour.zoom;
      camera.updateProjectionMatrix();
      cameraTour = null;
    }
  };
  const projected = new Vector3();
  let width = 1,
    height = 1;
  const resize = () => {
    invalidate();
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
    if (activeInstrument) {
      if (frameGate.request()) frameInstrument(activeInstrument);
    } else if (framedPlace) framePlace(framedPlace);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(mount);
  resize();
  const observedPanels = new Set<Element>();
  const observePanels = () => {
    for (const old of observedPanels)
      if (!old.isConnected) {
        observer.unobserve(old);
        observedPanels.delete(old);
      }
    for (const node of mount
      .closest("section")
      ?.querySelectorAll(
        "[data-observatory-header], [data-observatory-panel]",
      ) ?? []) {
      if (!observedPanels.has(node)) {
        observedPanels.add(node);
        observer.observe(node);
      }
    }
    if (activeInstrument) {
      if (frameGate.request()) frameInstrument(activeInstrument);
    } else if (framedPlace && !gesture) framePlace(framedPlace);
  };
  const panelObserver = new MutationObserver(observePanels);
  if (mount.parentElement?.parentElement)
    panelObserver.observe(mount.parentElement.parentElement, {
      subtree: true,
      childList: true,
    });
  observePanels();
  let elapsed = 0,
    last = 0;
  renderer.setAnimationLoop((ms) => {
    if (disposed || !visible || !ready) return;
    if (
      !motion &&
      !needsRender &&
      !keys.size &&
      virtualInput.every((v) => v === 0)
    )
      return;
    needsRender = false;
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
    const input: [number, number] = [
      virtualInput[0] +
        Number(keys.has("d") || keys.has("arrowright")) -
        Number(keys.has("a") || keys.has("arrowleft")),
      virtualInput[1] +
        Number(keys.has("w") || keys.has("arrowup")) -
        Number(keys.has("s") || keys.has("arrowdown")),
    ];
    const manuallyMoving = Math.hypot(...input) > 0 && walkStep(input, delta);
    if (walking && following && motion) {
      const target = actor.position.clone().add(new Vector3(0, 1.2, 0));
      const shift = target
        .sub(controls.target)
        .multiplyScalar(1 - Math.exp(-delta * 4));
      controls.target.add(shift);
      camera.position.add(shift);
      camera.zoom += (1.7 - camera.zoom) * (1 - Math.exp(-delta * 3));
      camera.updateProjectionMatrix();
    }
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
        (remaining.length || manuallyMoving) && motion
          ? Math.sin(elapsed * 12 + i * Math.PI) * 0.45
          : 0;
    }
    for (const [i, arm] of arms.entries()) {
      arm.rotation.x =
        (remaining.length || manuallyMoving) && motion
          ? -Math.sin(elapsed * 12 + i * Math.PI) * 0.3
          : 0;
    }
    announceNearby();
    exhibits.animate(elapsed, motion, camera.quaternion);
    spatialFeedback.animate(delta, motion);
    expeditionTrail.animate(elapsed, motion);
    for (const { location, ring } of beacons) {
      const completed =
        state.selected &&
        isPlayDestination(location) &&
        state.activities[state.selected]?.[location]?.completed;
      ring.material.color.set(completed ? "#ffc577" : "#69cddd");
      ring.material.opacity = completed
        ? 0.95
        : state.connected.length
          ? 0.5
          : 0.15;
      ring.scale.setScalar(
        completed && motion ? 1 + Math.sin(elapsed * 2) * 0.08 : 1,
      );
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
      if (object instanceof InstancedMesh) object.dispose();
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
    setMotionPaused(paused) {
      motionAllowed = !paused;
      changeMotion();
    },
    focusInstrument(id) {
      invalidate();
      const previous = activeInstrument;
      endGesture();
      activeInstrument = id;
      frameGate.select();
      exhibits.focus(id);
      inspectionLight.visible = !!id;
      if (id) {
        const view = exhibits.views.find((v) => v.destination === id)!;
        inspectionLight.position
          .copy(view.root.position)
          .add(new Vector3(1.3, 2.3, 2));
      }
      clearInput();
      following = false;
      if (id) {
        remaining = [];
        frameInstrument(id);
      } else if (previous && ready) framePlace(state.location);
    },
    setState(next) {
      invalidate();
      const feedback = feedbackTransition(state, next);
      if (clearsSpatialFeedback(state, next)) spatialFeedback.reset();
      if (feedback) {
        const root = exhibits.views.find(
          (view) => view.destination === feedback.location,
        )?.root.position;
        const source = capsules[ids.indexOf(feedback.source)].group.position;
        spatialFeedback.emit(
          feedback,
          feedback.kind === "inspected"
            ? [source.x, 0.5, source.z]
            : root
              ? [root.x, root.y, root.z]
              : undefined,
        );
      }
      if (next.selected !== state.selected) {
        endGesture();
        exhibits.resetMotion();
      } else if (next.selected && isPlayDestination(next.location)) {
        const before =
          state.activities[next.selected]?.[next.location]?.operations ?? 0;
        const after =
          next.activities[next.selected]?.[next.location]?.operations ?? 0;
        if (after > before) exhibits.trigger(next.location);
        else if (after < before) exhibits.resetMotion();
      }
      if (!next.selected && state.selected) {
        remaining = [];
        actor.position.set(-1, 0.5, 9.4);
        clearInput();
        following = false;
        announceNearby();
      }

      if (next.travel !== state.travel || next.location !== state.location) {
        visit(next.location);
        framePlace(next.location);
      } else if (next.selected && next.selected !== state.selected)
        framePlace("signals");
      const beforeMission = expeditionMission(state);
      const afterMission = expeditionMission(next);
      if (
        next.selected !== state.selected ||
        next.travel !== state.travel ||
        beforeMission.destination !== afterMission.destination ||
        beforeMission.complete !== afterMission.complete
      ) {
        expeditionTrail.update(
          [actor.position.x, actor.position.y, actor.position.z],
          afterMission.destination,
        );
      }
      expeditionTrail.updateReceipts(next);
      if (!next.selected) spatialFeedback.reset();
      state = next;
      exhibits.update(next);
      connections.visible = next.connected.length > 0;
    },
    setWalking(enabled, blocked) {
      const enteringWalkMode = enabled && !walking;
      walking = enabled;
      paused = blocked;
      if (!enabled || blocked) {
        clearInput();
        following = false;
      }
      if (enteringWalkMode) remaining = [];
    },
    walk(input) {
      virtualInput = input;
    },
    nudge(input) {
      invalidate();
      walkStep(input, 0.05);
      announceNearby();
    },
    interact,
    reset() {
      invalidate();
      clearInput();
      remaining = [];
      following = false;
      actor.position.set(-1, 0.5, 9.4);
      announceNearby();
      spatialFeedback.reset();
    },
    home() {
      invalidate();
      framedPlace = null;
      following = false;
      cameraTour = null;
      camera.position.set(23, 25, 36);
      controls.target.set(0, 2.6, 1.2);
      camera.zoom = 1;
      camera.updateProjectionMatrix();
      controls.update();
    },
    dispose() {
      endGesture();
      disposed = true;
      modelRequest.abort();
      renderer.setAnimationLoop(null);
      controls.removeEventListener("change", invalidate);
      observer.disconnect();
      panelObserver.disconnect();
      document.removeEventListener("visibilitychange", changeVisible);
      mount.removeEventListener("keydown", keyDown);
      document.removeEventListener("keyup", keyUp);
      mount.removeEventListener("blur", clearInput);
      window.removeEventListener("blur", clearInput);
      media.removeEventListener("change", changeMotion);
      renderer.domElement.removeEventListener("pointerdown", pointerDown, true);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("pointercancel", pointerCancel);
      renderer.domElement.removeEventListener("pointerleave", pointerCancel);
      renderer.domElement.removeEventListener(
        "lostpointercapture",
        pointerCancel,
      );
      window.removeEventListener("blur", pointerCancel);
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
