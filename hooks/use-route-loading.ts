"use client";

import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";

export function useRouteLoading(thresholdMs = 150) {
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
    };

    const handleStop = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setIsLoading(false);
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
