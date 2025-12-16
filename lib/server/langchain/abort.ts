import type { NextApiRequest, NextApiResponse } from "next";

export function createRequestAbortSignal(
  req: NextApiRequest,
  res: NextApiResponse,
): {
  controller: AbortController;
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const signal = controller.signal;
  let cleanedUp = false;

  const onAbort = () => {
    if (!signal.aborted) {
      controller.abort();
    }
  };

  function cleanup() {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    req.off("aborted", onAbort);
    res.off("close", onAbort);
    res.off("finish", onFinish);
  }

  function onFinish() {
    cleanup();
  }

  req.on("aborted", onAbort);
  res.on("close", onAbort);
  res.on("finish", onFinish);

  return { controller, signal, cleanup };
}
