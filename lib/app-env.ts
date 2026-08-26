export type AppEnv = "dev" | "preview" | "prod";

/**
 * Resolves the deploy target this process is running on.
 *
 * Lives in its own module so `instrumentation.ts` can read it without pulling
 * the Langfuse ingestion module (and its dependency graph) into the
 * instrumentation bundle, which Next.js evaluates before anything else.
 */
export function getAppEnv(): AppEnv {
  const fromAppEnv = process.env.APP_ENV?.toLowerCase();

  if (
    fromAppEnv === "dev" ||
    fromAppEnv === "preview" ||
    fromAppEnv === "prod"
  ) {
    return fromAppEnv;
  }

  // Vercel sets NODE_ENV=production for Preview builds as well as Production
  // ones, so falling straight through to NODE_ENV tags every preview trace as
  // "prod" and mixes migration/test traffic into the production environment
  // view and the weekly digest. VERCEL_ENV is the only signal that separates
  // the two deploy targets.
  const fromVercelEnv = process.env.VERCEL_ENV?.toLowerCase();
  if (fromVercelEnv === "production") {
    return "prod";
  }
  if (fromVercelEnv === "preview") {
    return "preview";
  }
  if (fromVercelEnv === "development") {
    return "dev";
  }

  const normalizedNodeEnv = process.env.NODE_ENV?.toLowerCase();
  if (normalizedNodeEnv === "production") {
    return "prod";
  }
  if (normalizedNodeEnv === "preview") {
    return "preview";
  }
  if (normalizedNodeEnv === "development" || normalizedNodeEnv === "dev") {
    return "dev";
  }
  if (normalizedNodeEnv === "test") {
    return "dev";
  }

  return "dev";
}

/** True when running on Vercel, where a function instance can be frozen the
 * moment a response ends. */
export function isServerlessRuntime(): boolean {
  return process.env.VERCEL === "1";
}
