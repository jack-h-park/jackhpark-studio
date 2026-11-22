import { useEffect, useState } from "react";

import { readCampus } from "./three/readCampus";

export function useCampusDownload(enabled: boolean) {
  const [data, setData] = useState<Promise<ArrayBuffer> | null>(null);
  useEffect(() => {
    if (!enabled) {
      setData(null);
      return;
    }
    const controller = new AbortController();
    const request = readCampus(controller.signal);
    // The lazy renderer may not have arrived when a download fails. Observe the
    // rejection now while preserving the original promise for its error boundary.
    void request.catch(() => {});
    setData(request);
    return () => controller.abort();
  }, [enabled]);
  return enabled ? data : null;
}
