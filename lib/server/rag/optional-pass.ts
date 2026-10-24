import { AutoPassTimeoutError } from "@/lib/server/rag/auto-rag-decision";

export async function runOptionalPass<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal | null,
): Promise<T> {
  parentSignal?.throwIfAborted();
  const controller = new AbortController();
  let rejectCancellation!: (reason: unknown) => void;
  const cancellation = new Promise<never>((_, reject) => {
    rejectCancellation = reject;
  });
  const onParentAbort = () => {
    rejectCancellation(parentSignal!.reason);
    controller.abort(parentSignal!.reason);
  };
  parentSignal?.addEventListener("abort", onParentAbort, { once: true });
  const timer = setTimeout(() => {
    const reason = new AutoPassTimeoutError();
    // Settle cancellation first, so a synchronous abort handler cannot hide
    // the deadline with a provider error. The caller still checks the parent.
    rejectCancellation(reason);
    controller.abort(reason);
  }, timeoutMs);
  try {
    const work = new Promise<T>((resolve) => resolve(run(controller.signal)));
    // Promise.race observes late failures even if the operation ignores abort.
    return await Promise.race([cancellation, work]);
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", onParentAbort);
  }
}
