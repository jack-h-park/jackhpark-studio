import net from "node:net";

import { JSDOM } from "jsdom";

import { ingestionLogger } from "@/lib/logging/logger";

const DEFAULT_TIMEOUT_MS = 2500;
const DEFAULT_MAX_REDIRECTS = 3;
const LOCAL_HOSTNAMES = new Set([
  "localhost",
  "loopback",
  "ip6-localhost",
  "0.0.0.0",
  "::1",
]);

const successCache = new Map<string, string>();
const inflightCache = new Map<string, Promise<string | null>>();
type FetchOptions = {
  timeoutMs?: number;
  maxRedirects?: number;
};

type FaviconLogEvent = "start" | "resolved" | "failed";
type FaviconStrategy = "link" | "favicon_ico";

type FaviconEventPayload = {
  host: string;
  event: FaviconLogEvent;
  reason?: FaviconFailureReason;
  strategy?: FaviconStrategy;
  status?: number;
  ms?: number;
};

type FaviconResolveResult = {
  url: string | null;
  reason?: FaviconFailureReason;
  strategy?: FaviconStrategy;
};

type FaviconFetchResult = {
  response: Response;
  url: string;
};

type HostSafetyResult = {
  allowed: boolean;
  reason?: FaviconFailureReason;
};

export type FaviconFailureReason =
  | "timeout"
  | "blocked_private_ip"
  | "blocked_localhost"
  | "redirect_limit"
  | "non_200"
  | "parse_no_icon"
  | "fetch_error"
  | "invalid_url";

class FaviconFetchError extends Error {
  constructor(public reason: FaviconFailureReason) {
    super(reason);
  }
}

function logFaviconEvent(payload: FaviconEventPayload): void {
  ingestionLogger.debug("[favicon] resolution", payload);
}

export async function fetchFaviconForUrl(
  sourceUrl: string,
  options?: FetchOptions,
): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    logFaviconEvent({
      host: sourceUrl,
      event: "failed",
      reason: "invalid_url",
      ms: 0,
    });
    return null;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    logFaviconEvent({
      host: parsed.host,
      event: "failed",
      reason: "invalid_url",
      ms: 0,
    });
    return null;
  }

  const hostKey = parsed.host.toLowerCase();
  if (!hostKey) {
    logFaviconEvent({
      host: parsed.host,
      event: "failed",
      reason: "invalid_url",
      ms: 0,
    });
    return null;
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  if (successCache.has(hostKey)) {
    return successCache.get(hostKey) ?? null;
  }

  if (!inflightCache.has(hostKey)) {
    logFaviconEvent({
      host: hostKey,
      event: "start",
    });
    const start = Date.now();
    const resolution = resolveFaviconFromUrl(parsed, timeoutMs, maxRedirects)
      .then((result) => {
        const duration = Date.now() - start;
        if (result.url) {
          successCache.set(hostKey, result.url);
          logFaviconEvent({
            host: hostKey,
            event: "resolved",
            strategy: result.strategy,
            ms: duration,
          });
          return result.url;
        }
        logFaviconEvent({
          host: hostKey,
          event: "failed",
          reason: result.reason ?? "fetch_error",
          ms: duration,
        });
        return null;
      })
      .catch((err) => {
        const duration = Date.now() - start;
        const reason =
          err instanceof FaviconFetchError ? err.reason : "fetch_error";
        logFaviconEvent({
          host: hostKey,
          event: "failed",
          reason,
          ms: duration,
        });
        return null;
      })
      .finally(() => {
        inflightCache.delete(hostKey);
      });
    inflightCache.set(hostKey, resolution);
  }

  return inflightCache.get(hostKey) ?? Promise.resolve(null);
}

export function clearFaviconCache(): void {
  successCache.clear();
  inflightCache.clear();
}

async function resolveFaviconFromUrl(
  originUrl: URL,
  timeoutMs: number,
  maxRedirects: number,
): Promise<FaviconResolveResult> {
  const initialSafety = evaluateHostnameSafety(originUrl.hostname);
  if (!initialSafety.allowed) {
    return { url: null, reason: initialSafety.reason };
  }

  let fetchResult: FaviconFetchResult;
  try {
    fetchResult = await fetchHtmlWithRedirects(
      originUrl.toString(),
      timeoutMs,
      maxRedirects,
    );
  } catch (err) {
    if (err instanceof FaviconFetchError) {
      return { url: null, reason: err.reason };
    }
    return { url: null, reason: "fetch_error" };
  }

  if (!fetchResult) {
    return { url: null, reason: "fetch_error" };
  }

  const contentType =
    fetchResult.response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("html")) {
    const html = await fetchResult.response.text();
    const iconLink = extractIconLinkFromHtml(html, fetchResult.url);
    if (iconLink) {
      try {
        const resolved = new URL(iconLink);
        const iconSafety = evaluateHostnameSafety(resolved.hostname);
        if (!iconSafety.allowed) {
          return { url: null, reason: iconSafety.reason };
        }
        return { url: resolved.toString(), strategy: "link" };
      } catch {
        return { url: null, reason: "parse_no_icon" };
      }
    }
  }

  return {
    url: `${originUrl.origin}/favicon.ico`,
    strategy: "favicon_ico",
  };
}

async function fetchHtmlWithRedirects(
  url: string,
  timeoutMs: number,
  maxRedirects: number,
): Promise<FaviconFetchResult> {
  let currentUrl = url;
  let redirects = 0;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    while (true) {
      const response = await fetch(currentUrl, {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9",
          "User-Agent": "jackhpark-nextjs-notion/1.0 (+https://jackhpark.com/)",
        },
        redirect: "manual",
        signal: controller.signal,
      });

      if (
        response.status >= 300 &&
        response.status < 400 &&
        redirects < maxRedirects
      ) {
        const location = response.headers.get("location");
        if (!location) {
          throw new FaviconFetchError("fetch_error");
        }

        const nextUrl = new URL(location, currentUrl);
        if (!["http:", "https:"].includes(nextUrl.protocol)) {
          throw new FaviconFetchError("invalid_url");
        }

        const hostSafety = evaluateHostnameSafety(nextUrl.hostname);
        if (!hostSafety.allowed) {
          throw new FaviconFetchError(
            hostSafety.reason ?? "blocked_private_ip",
          );
        }

        currentUrl = nextUrl.toString();
        redirects += 1;
        continue;
      }

      if (response.status >= 300 && response.status < 400) {
        throw new FaviconFetchError("redirect_limit");
      }

      return { response, url: currentUrl };
    }
  } catch (err) {
    if (err instanceof FaviconFetchError) {
      throw err;
    }
    if ((err as Error)?.name === "AbortError") {
      throw new FaviconFetchError("timeout");
    }
    throw new FaviconFetchError("fetch_error");
  } finally {
    clearTimeout(timer);
  }
}

function extractIconLinkFromHtml(html: string, baseUrl: string): string | null {
  try {
    const dom = new JSDOM(html);
    const links = Array.from(
      dom.window.document.querySelectorAll("link[rel][href]"),
    ) as Element[];
    for (const link of links) {
      const rel = link.getAttribute("rel");
      if (!rel) {
        continue;
      }

      const tokens = rel.toLowerCase().split(/\s+/).filter(Boolean);
      if (!tokens.includes("icon")) {
        continue;
      }

      const href = link.getAttribute("href");
      if (!href) {
        continue;
      }

      try {
        return new URL(href, baseUrl).toString();
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function evaluateHostnameSafety(hostname: string): HostSafetyResult {
  if (!hostname) {
    return { allowed: false, reason: "invalid_url" };
  }

  const normalized = hostname.toLowerCase();
  if (LOCAL_HOSTNAMES.has(normalized)) {
    return { allowed: false, reason: "blocked_localhost" };
  }

  const ipVersion = net.isIP(normalized);
  if (ipVersion) {
    if (isPrivateIp(normalized, ipVersion)) {
      return { allowed: false, reason: "blocked_private_ip" };
    }
  }

  return { allowed: true };
}

function isPrivateIp(address: string, version: number): boolean {
  const normalized = address.split("%")[0].toLowerCase();
  if (version === 4) {
    return isPrivateIpv4(normalized);
  }

  if (version === 6) {
    return isPrivateIpv6(normalized);
  }

  return false;
}
function isPrivateIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) {
    return false;
  }

  const octets = parts.map(Number);
  if (octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  const [o0, o1] = octets;
  if (o0 === 10) {
    return true;
  }
  if (o0 === 127) {
    return true;
  }
  if (o0 === 169 && o1 === 254) {
    return true;
  }
  if (o0 === 172 && o1 >= 16 && o1 <= 31) {
    return true;
  }
  if (o0 === 192 && o1 === 168) {
    return true;
  }
  if (o0 === 0) {
    return true;
  }

  return false;
}

function isPrivateIpv6(value: string): boolean {
  if (value === "::1") {
    return true;
  }

  if (value.startsWith("fc") || value.startsWith("fd")) {
    return true;
  }

  if (value.startsWith("fe80")) {
    return true;
  }

  return false;
}
