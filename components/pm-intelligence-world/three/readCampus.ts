const campusModelPath = "/experiences/pm-intelligence/observatory/campus.glb";

export async function readCampus(signal?: AbortSignal): Promise<ArrayBuffer> {
  if (typeof DecompressionStream !== "undefined") {
    try {
      const response = await fetch(`${campusModelPath}.gz`, { signal });
      if (!response.ok || !response.body)
        throw new Error(`Compressed model unavailable: ${response.status}`);
      return await new Response(
        response.body.pipeThrough(new DecompressionStream("gzip")),
      ).arrayBuffer();
    } catch (err) {
      if (signal?.aborted) throw err;
      // Keep the existing model available when native decoding or transport fails.
    }
  }
  const response = await fetch(campusModelPath, { signal });
  if (!response.ok)
    throw new Error(`Observatory model unavailable: ${response.status}`);
  return response.arrayBuffer();
}
