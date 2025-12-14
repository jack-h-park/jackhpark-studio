export function isDevOnly(): boolean {
  if (typeof window === "undefined") {
    // Server-side
    return (
      process.env.NODE_ENV !== "production" ||
      process.env.VERCEL_ENV === "preview" ||
      process.env.NEXT_PUBLIC_DEV_DIAGNOSTICS === "true"
    );
  } else {
    // Client-side
    return (
      process.env.NODE_ENV !== "production" ||
      process.env.NEXT_PUBLIC_VERCEL_ENV === "preview" ||
      isDevDiagnosticsEnabled()
    );
  }
}

export function isDevDiagnosticsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    process.env.NEXT_PUBLIC_DEV_DIAGNOSTICS === "true" ||
    window.location.search.includes("debug=true")
  );
}
