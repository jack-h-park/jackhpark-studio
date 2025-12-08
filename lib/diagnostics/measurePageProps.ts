type SerializableProps = Record<string, any>;

export function logPagePropsSize(pageId: string, props: SerializableProps) {
  if (process.env.NODE_ENV === "production") {
    return props;
  }

  try {
    const json = JSON.stringify(props);
    const totalBytes = Buffer.byteLength(json, "utf8");
    const totalKb = totalBytes / 1024;

    const perKeySummary: Record<string, any> = {};
    for (const [key, value] of Object.entries(props)) {
      try {
        const keyJson = JSON.stringify(value);
        const keyBytes = Buffer.byteLength(keyJson, "utf8");
        const keyKb = keyBytes / 1024;
        perKeySummary[key] = {
          type: Array.isArray(value) ? "array" : typeof value,
          approxKb: Number(keyKb.toFixed(1)),
        };
      } catch {
        perKeySummary[key] = {
          type: Array.isArray(value) ? "array" : typeof value,
          approxKb: "error-serializing",
        };
      }
    }

    console.log(
      `[page-props-size] ${pageId} total ~${totalKb.toFixed(1)} kB, keys:`,
      perKeySummary,
    );
  } catch (err) {
    console.warn(
      `[page-props-size] Failed to measure props for ${pageId}:`,
      err,
    );
  }

  return props;
}
