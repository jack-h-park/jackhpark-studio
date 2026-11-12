// Keep analytics outside hydration and the triggering interaction; the ten-second
// fallback preserves reporting for sessions without interaction.
export function installGoogleAnalyticsLoader(gaId: string | undefined) {
  if (!gaId || document.getElementById("gtag-js")) {
    return;
  }

  const EVENTS = ["pointerdown", "keydown", "touchstart", "wheel", "scroll"];
  let loaded = false;

  const load = () => {
    if (loaded || document.getElementById("gtag-js")) return;
    loaded = true;
    const script = document.createElement("script");
    script.id = "gtag-js";
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
    document.head.append(script);
  };

  const schedule = () => {
    cleanup();
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(load, { timeout: 2000 });
    } else {
      window.setTimeout(load, 200);
    }
  };

  // Bounds the delay so a session that never interacts still reports.
  const fallback = window.setTimeout(schedule, 10_000);

  function cleanup() {
    window.clearTimeout(fallback);
    for (const name of EVENTS) {
      window.removeEventListener(name, schedule);
    }
  }

  for (const name of EVENTS) {
    window.addEventListener(name, schedule, { passive: true });
  }

  return cleanup;
}
