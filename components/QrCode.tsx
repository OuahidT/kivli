"use client";

import QRCode from "qrcode";
import { useEffect, useRef } from "react";

export function QrCode({ value, size = 196, label = "QR code" }: { value: string; size?: number; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    QRCode.toCanvas(ref.current, value, {
      width: size,
      margin: 1,
      color: { dark: "#161513", light: "#ffffff" },
      errorCorrectionLevel: "M",
    }).catch(() => undefined);
  }, [size, value]);

  return <canvas ref={ref} width={size} height={size} role="img" aria-label={label} />;
}
