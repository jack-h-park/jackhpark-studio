"use client";

import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";

const defaultThreshold = process.env.NODE_ENV === "production" ? 150 : 10;

export function useRouteLoading(thresholdMs = defaultThreshold) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleStart = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        setIsLoading(true);
      }, thresholdMs);
      if (process.env.NODE_ENV !== "production") {
        console.debug("[useRouteLoading] routeChangeStart");
      }
    };

    const handleStop = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setIsLoading(false);
      if (process.env.NODE_ENV !== "production") {
        console.debug("[useRouteLoading] routeChangeEnd");
      }
    };

    router.events.on("routeChangeStart", handleStart);
    router.events.on("routeChangeComplete", handleStop);
    router.events.on("routeChangeError", handleStop);

    return () => {
      router.events.off("routeChangeStart", handleStart);
      router.events.off("routeChangeComplete", handleStop);
      router.events.off("routeChangeError", handleStop);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [router.events, thresholdMs]);

  return isLoading;
}
