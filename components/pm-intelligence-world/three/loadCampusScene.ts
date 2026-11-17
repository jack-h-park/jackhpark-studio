import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export async function loadCampusScene(
  download: Promise<ArrayBuffer>,
  isDisposed: () => boolean,
  onLoaded: () => void,
) {
  const data = await download;
  // A replacement renderer may share this promise after the old one is disposed.
  if (isDisposed())
    throw new DOMException("Observatory disposed", "AbortError");
  onLoaded();
  return new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(data, "/experiences/pm-intelligence/observatory/");
}
