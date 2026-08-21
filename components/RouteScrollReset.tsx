"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function RouteScrollReset() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    if (window.location.hash) return;
    const root = document.documentElement;
    root.dataset.routeReset = "true";
    window.scrollTo(0, 0);
    const frame = window.requestAnimationFrame(() => delete root.dataset.routeReset);
    return () => window.cancelAnimationFrame(frame);
  }, [routeKey]);

  return null;
}
