import { isReadingFragment } from "@/lib/pm-intelligence-world/navigation";

// Optional SDKs must not compete with the world's renderer/model download.
// User Timing is best-effort; reporting still starts when diagnostics fail.
export function scheduleExperienceAnalytics(start: () => void) {
  if (isReadingFragment(window.location.hash)) {
    start();
    return () => {};
  }
  let cancelled = false;
  let scheduled = false;
  let observer: PerformanceObserver | undefined;
  let idle: number | undefined;
  let task: number | undefined;
  const events = ["hashchange", "popstate", "click"];
  const readyMark = "pm-world:interactive";

  const launch = () => {
    idle = undefined;
    task = undefined;
    if (!cancelled) start();
  };
  const onNavigation = () => {
    if (isReadingFragment(window.location.hash)) schedule();
  };
  const stopWaiting = () => {
    window.clearTimeout(fallback);
    observer?.disconnect();
    for (const event of events) window.removeEventListener(event, onNavigation);
  };
  function schedule() {
    if (cancelled || scheduled) return;
    scheduled = true;
    stopWaiting();
    if (typeof window.requestIdleCallback === "function") {
      idle = window.requestIdleCallback(launch, { timeout: 2000 });
    } else {
      task = window.setTimeout(launch, 0);
    }
  }
  const fallback = window.setTimeout(schedule, 15_000);
  // React's reading button uses pushState, which does not emit hashchange.
  for (const event of events)
    window.addEventListener(event, onNavigation, { passive: true });

  const cleanup = () => {
    cancelled = true;
    stopWaiting();
    if (idle !== undefined) window.cancelIdleCallback?.(idle);
    if (task !== undefined) window.clearTimeout(task);
  };
  try {
    if (window.performance.getEntriesByName(readyMark).length) {
      schedule();
      return cleanup;
    }
  } catch {
    // Continue with the observer/fallback if timeline reads are unavailable.
  }
  try {
    observer = new window.PerformanceObserver((list) => {
      if (list.getEntries().some((entry) => entry.name === readyMark))
        schedule();
    });
    observer.observe({ type: "mark", buffered: true });
  } catch {
    // The bounded timer also covers unsupported observers and failed worlds.
  }
  return cleanup;
}
