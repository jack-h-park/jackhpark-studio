import { useCallback, useState } from "react";

export type RefreshStatus = "idle" | "refreshing" | "success" | "error";

export type PublicSiteRefreshState = {
  path: string;
  setPath: (path: string) => void;
  status: RefreshStatus;
  message: string;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
};

function getResponseError(payload: unknown): string | null {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  return null;
}

function getRevalidatedPath(payload: unknown): string | null {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "revalidatedPath" in payload &&
    typeof payload.revalidatedPath === "string" &&
    payload.revalidatedPath.trim()
  ) {
    return payload.revalidatedPath;
  }

  return null;
}

export function usePublicSiteRefresh(): PublicSiteRefreshState {
  const [pathInput, setPath] = useState("/studio");
  const [status, setStatus] = useState<RefreshStatus>("idle");
  const [message, setMessage] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    const path = pathInput.trim();
    if (!path) {
      setStatus("error");
      setMessage("Enter a public page path.");
      return;
    }

    setStatus("refreshing");
    setMessage("");
    setIsRefreshing(true);

    try {
      const response = await fetch("/api/admin/revalidate-public-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setStatus("error");
        setMessage(getResponseError(payload) ?? "Unable to refresh this page.");
        return;
      }

      const revalidatedPath = getRevalidatedPath(payload);
      if (!revalidatedPath) {
        setStatus("error");
        setMessage("Unable to refresh this page.");
        return;
      }

      setStatus("success");
      setMessage(`Refreshed ${revalidatedPath}.`);
    } catch {
      setStatus("error");
      setMessage("Unable to refresh this page.");
    } finally {
      setIsRefreshing(false);
    }
  }, [pathInput]);

  return {
    path: pathInput,
    setPath,
    status,
    message,
    isRefreshing,
    refresh,
  };
}
