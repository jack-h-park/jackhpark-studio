import net from "node:net";

import { JSDOM } from "jsdom";

const DEFAULT_TIMEOUT_MS = 2500;
const DEFAULT_MAX_REDIRECTS = 3;
const LOCAL_HOSTNAMES = new Set([
  "localhost",
  "loopback",
  "ip6-localhost",
  "0.0.0.0",
  "::1",
]);

const faviconCache = new Map<string, Promise<string | null>>();
type FetchOptions = {
  timeoutMs?: number;
  maxRedirects?: number;
};

export async function fetchFaviconForUrl(
  sourceUrl: string,
  options?: FetchOptions,
): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return null;
  }

  const hostKey = parsed.host.toLowerCase();
  if (!hostKey) {
    return null;
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  if (!faviconCache.has(hostKey)) {
    const resolution = resolveFaviconFromUrl(
      parsed,
      timeoutMs,
      maxRedirects,
    ).catch(() => null);
    faviconCache.set(hostKey, resolution);
  }

  return faviconCache.get(hostKey) ?? null;
}

export function clearFaviconCache(): void {
  faviconCache.clear();
}

async function resolveFaviconFromUrl(
  originUrl: URL,
  timeoutMs: number,
  maxRedirects: number,
): Promise<string | null> {
  if (!(await isHostnameSafe(originUrl.hostname))) {
    return null;
  }

  const fetchResult = await fetchHtmlWithRedirects(
    originUrl.toString(),
    timeoutMs,
    maxRedirects,
  );
  if (!fetchResult) {
    return null;
  }

  const contentType =
    fetchResult.response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("html")) {
    const html = await fetchResult.response.text();
    const iconLink = extractIconLinkFromHtml(html, fetchResult.url);
    if (iconLink) {
      try {
        const resolved = new URL(iconLink);
        if (!(await isHostnameSafe(resolved.hostname))) {
          return null;
        }
        return resolved.toString();
      } catch {
        return null;
      }
    }
  }

  return `${originUrl.origin}/favicon.ico`;
}

async function fetchHtmlWithRedirects(
  url: string,
  timeoutMs: number,
  maxRedirects: number,
): Promise<{ response: Response; url: string } | null> {
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
          "User-Agent":
            "jackhpark-nextjs-notion/1.0 (+https://jackhpark.com/)",
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
          break;
        }

        const nextUrl = new URL(location, currentUrl);
        if (!["http:", "https:"].includes(nextUrl.protocol)) {
          return null;
        }

        if (!(await isHostnameSafe(nextUrl.hostname))) {
          return null;
        }

        currentUrl = nextUrl.toString();
        redirects += 1;
        continue;
      }

      if (response.status >= 300 && response.status < 400) {
        return null;
      }

      return { response, url: currentUrl };
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractIconLinkFromHtml(html: string, baseUrl: string): string | null {
  try {
    const dom = new JSDOM(html);
    const links = Array.from(dom.window.document.querySelectorAll("link[rel][href]"));
    for (const link of links) {
      const rel = link.getAttribute("rel");
      if (!rel) {
        continue;
      }

      const tokens = rel
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
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

async function isHostnameSafe(hostname: string): Promise<boolean> {
  if (!hostname) {
    return false;
  }

  const normalized = hostname.toLowerCase();
  if (LOCAL_HOSTNAMES.has(normalized)) {
    return false;
  }

  const ipVersion = net.isIP(normalized);
  if (ipVersion) {
    return !isPrivateIp(normalized, ipVersion);
  }

  return true;
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
