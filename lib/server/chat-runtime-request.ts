import type { NextApiRequest } from "next";

import type { ChatModelSettings } from "@/lib/server/settings/model-settings";

/**
 * `/api/chat` resolves the runtime once and stashes it on the request so the
 * heavy handler does not reload it. Both sides used `(req as any).chatRuntime`,
 * which meant nothing checked that the writer and the reader agreed on the
 * shape — or on the property name.
 */
export type ChatRuntimeRequest = NextApiRequest & {
  chatRuntime?: ChatModelSettings;
};
