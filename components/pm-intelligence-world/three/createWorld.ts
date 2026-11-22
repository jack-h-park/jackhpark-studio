import { gsap } from "gsap";
import {
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  type Material,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  Raycaster,
  Scene,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";

import type { SectionId } from "@/content/pm-intelligence-world/types";
import {
  projectSceneLabel,
  resolveLabelLayout,
  type SceneLabelElements,
  type SceneLeaderElements,
  spatialLabels,
} from "@/lib/pm-intelligence-world/scene-labels";
import {
  sceneLayout,
  type SceneSelection,
} from "@/lib/pm-intelligence-world/scene-layout";

import { createStation, resolveStationId } from "./stations";

export interface WorldHandle {
  setSelection: (selection: SceneSelection) => void;
  setMotionEnabled: (enabled: boolean) => void;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
}
export function createWorld({
  container,
  onFocus,
  onFailure,
  labels = {},
  leaders = {},
}: {
  container: HTMLElement;
  onFocus: (section: SectionId) => void;
  onFailure: () => void;
  labels?: SceneLabelElements;
  leaders?: SceneLeaderElements;
}): WorldHandle {
  const style = getComputedStyle(container);
  const brand = (token: string) =>
    new Color(style.getPropertyValue(token).trim());
  const cyan = brand("--brand-cyan"),
    blue = brand("--brand-blue"),
    purple = brand("--brand-purple"),
    pink = brand("--brand-pink");
  const ink = new Color(getComputedStyle(container).color);
  const surface = ink.clone().multiplyScalar(0.12);
  const scene = new Scene();
  scene.background = ink.clone().multiplyScalar(0.018);
  const camera = new PerspectiveCamera(38, 1, 0.1, 120);
  camera.position.set(...sceneLayout.overview.camera);
  const target = new Vector3();
  const renderer = new WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(
    Math.min(devicePixelRatio, innerWidth <= 768 ? 1 : 1.5),
  );
  container.append(renderer.domElement);
  renderer.domElement.setAttribute(
    "aria-label",
    "Illustrative PM Intelligence world; use the HTML navigation to explore.",
  );
  scene.add(new AmbientLight(ink, 2.2));
  const light = new DirectionalLight(ink, 4);
  light.position.set(4, 12, 6);
  scene.add(light);
  const pickable: Object3D[] = [];
  const nodes = new Map<SectionId, Group>();
  const discoveryMaterials = new Map<SectionId, MeshStandardMaterial[]>();
  const materials: MeshStandardMaterial[] = [];
  const material = (color: Color, metalness = 0.2) => {
    const m = new MeshStandardMaterial({ color, metalness, roughness: 0.55 });
    materials.push(m);
    return m;
  };
  const neutral = material(surface);
  const ground = material(ink.clone().multiplyScalar(0.018));

  const mesh = (
    geometry: BoxGeometry | CylinderGeometry | TorusGeometry,
    m: MeshStandardMaterial,
    parent: Group | Scene,
    x = 0,
    y = 0,
    z = 0,
  ) => {
    const object = new Mesh(geometry, m);
    object.position.set(x, y, z);
    parent.add(object);
    return object;
  };
  mesh(new CylinderGeometry(10.3, 10.3, 0.15, 80), ground, scene, 0, -0.35, 0);
  const addNode = (id: SectionId, color: Color) => {
    const node = new Group();
    node.position.set(...sceneLayout[id].position);
    scene.add(node);
    nodes.set(id, node);
    const m = material(color.clone().multiplyScalar(0.48));
    const base = mesh(new CylinderGeometry(1.55, 1.7, 0.3, 48), neutral, node);
    base.userData.section = id;
    pickable.push(node);
    const ring = mesh(
      new TorusGeometry(1.55, 0.026, 8, 80),
      material(color),
      node,
      0,
      0.2,
      0,
    );
    discoveryMaterials.set(id, [ring.material]);
    ring.material.emissive.copy(color);
    ring.material.emissiveIntensity = 0;
    ring.rotation.x = Math.PI / 2;
    return { node, m };
  };
  for (const [id, color] of [
    ["knowledge", cyan],
    ["inputs", pink],
    ["writing", blue],
    ["questions", purple],
    ["learning", cyan],
    ["decisions", blue],
  ] as const) {
    const { node } = addNode(id, color);
    node.userData.section = id;
    node.add(createStation(id, color));
  }
  for (const id of [
    "inputs",
    "writing",
    "questions",
    "learning",
    "decisions",
  ] as SectionId[]) {
    const p = new Vector3(...sceneLayout[id].position);
    const length = p.length() - 3;
    const pathMaterial = material(blue.clone().multiplyScalar(0.45));
    pathMaterial.emissive.copy(cyan);
    discoveryMaterials.get(id)?.push(pathMaterial);
    const strip = mesh(
      new BoxGeometry(0.035, 0.025, length),
      pathMaterial,
      scene,
      p.x / 2,
      -0.2,
      p.z / 2,
    );
    strip.rotation.y = Math.atan2(p.x, p.z);
    for (let i = 0; i < 3; i++)
      mesh(
        new BoxGeometry(0.07, 0.07, 0.07),
        material(cyan),
        scene,
        p.x * (0.3 + i * 0.15),
        -0.12,
        p.z * (0.3 + i * 0.15),
      );
  }
  let frame = 0,
    disposed = false,
    visible = true,
    motion = true;
  let current: SceneSelection = {
    section: "overview",
    selectedInput: null,
    selectedRecord: null,
  };
  let tweens: gsap.core.Tween[] = [];
  const draw = () => {
    frame = 0;
    if (disposed || !visible) return;
    camera.lookAt(target);
    renderer.render(scene, camera);
    const size = {
      width: container.clientWidth,
      height: container.clientHeight,
    };
    const boxes = spatialLabels.map((label) => {
      const element = labels[label.id];
      const position = sceneLayout[label.id].position;
      const projected = projectSceneLabel(
        [position[0], label.height, position[2]],
        camera,
        size,
      );
      return {
        id: label.id,
        ...projected,
        width: element?.offsetWidth || 110,
        height: element?.offsetHeight || 48,
      };
    });
    for (const layout of resolveLabelLayout(boxes, size)) {
      const id = layout.id as SectionId,
        element = labels[id];
      if (!element) continue;
      element.hidden = !layout.visible;
      element.style.left = `${layout.x}px`;
      element.style.top = `${layout.y}px`;
      const leader = leaders[id];
      if (leader) {
        const position = sceneLayout[id].position;
        const anchor = projectSceneLabel(
          [position[0], 1, position[2]],
          camera,
          size,
        );
        leader.style.display = layout.visible ? "" : "none";
        leader.setAttribute("x1", String(anchor.x));
        leader.setAttribute("y1", String(anchor.y));
        leader.setAttribute("x2", String(layout.x));
        leader.setAttribute("y2", String(layout.y));
      }
    }
  };
  const invalidate = () => {
    if (!frame && !disposed && visible) frame = requestAnimationFrame(draw);
  };
  const resize = () => {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    invalidate();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const pick = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickable, true)[0];
    const id = hit ? resolveStationId(hit.object) : null;
    if (id) onFocus(id);
  };
  renderer.domElement.addEventListener("pointerup", pick);
  const lost = (event: Event) => {
    event.preventDefault();
    onFailure();
  };
  renderer.domElement.addEventListener("webglcontextlost", lost);
  const setSelection = (selection: SceneSelection) => {
    current = selection;
    for (const t of tweens) t.kill();
    tweens = [];
    for (const [id, nodeMaterials] of discoveryMaterials) {
      const intensity = selection.illuminated?.includes(id) ? 1.3 : 0;
      for (const m of nodeMaterials) {
        if (motion)
          tweens.push(
            gsap.to(m, {
              emissiveIntensity: intensity,
              duration: 0.65,
              onUpdate: invalidate,
            }),
          );
        else m.emissiveIntensity = intensity;
      }
    }
    const pose = sceneLayout[selection.section];
    for (const [id, node] of nodes)
      node.scale.setScalar(id === selection.section ? 1.12 : 1);
    if (!motion) {
      camera.position.set(...pose.camera);
      target.set(...pose.position);
      invalidate();
      return;
    }
    tweens.push(
      gsap.to(camera.position, {
        x: pose.camera[0],
        y: pose.camera[1],
        z: pose.camera[2],
        duration: 0.85,
        ease: "power2.inOut",
        onUpdate: invalidate,
      }),
      gsap.to(target, {
        x: pose.position[0],
        y: pose.position[1],
        z: pose.position[2],
        duration: 0.85,
        ease: "power2.inOut",
        onUpdate: invalidate,
      }),
    );
  };
  return {
    setSelection,
    setMotionEnabled(enabled) {
      motion = enabled;
      setSelection(current);
    },
    setVisible(value) {
      visible = value;
      for (const t of tweens) value ? t.resume() : t.pause();
      if (value) invalidate();
      else cancelAnimationFrame(frame);
      frame = 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const t of tweens) t.kill();
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerup", pick);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      const usedMaterials = new Set<Material>(materials);
      scene.traverse((object) => {
        if (object instanceof Mesh) {
          object.geometry.dispose();
          for (const m of Array.isArray(object.material)
            ? object.material
            : [object.material])
            usedMaterials.add(m);
        }
      });
      for (const m of usedMaterials) m.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
