const normalizeDebugValue = (value: string | undefined | null) =>
  (value ?? "")
    .trim()
    .toLowerCase();

const rawDebugValue = normalizeDebugValue(process.env.DEBUG_NOTION_X);

export const debugNotionXEnabled =
  rawDebugValue === "1" ||
  rawDebugValue === "true" ||
  rawDebugValue === "yes" ||
  rawDebugValue === "on";

type ConsoleMethod = (...args: unknown[]) => void;

const wrap =
  (method: ConsoleMethod): ConsoleMethod =>
  (...args) => {
    if (!debugNotionXEnabled) return;
    method.apply(console, args);
  };

export const debugNotionXLogger = {
  log: wrap(console.log),
  info: wrap(console.info),
  debug: wrap(console.debug),
};
