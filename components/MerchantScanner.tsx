"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type BarcodeHit = { rawValue: string };
type BarcodeDetectorLike = { detect(source: HTMLVideoElement): Promise<BarcodeHit[]> };
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorLike;

function extractCode(value: string) {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    return (parts.at(-1) ?? trimmed).toUpperCase();
  } catch {
    return trimmed.toUpperCase();
  }
}

export function MerchantScanner({ onDetected, busy }: { onDetected: (code: string, quantity: number) => void; busy: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [manual, setManual] = useState("");
  const [quantity, setQuantity] = useState(1);

  function stop() {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  useEffect(() => stop, []);

  async function start() {
    setCameraError("");
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("Le scan caméra n’est pas disponible ici. Saisis le code affiché sous le QR.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setCameraOpen(true);
      const detector = new Detector({ formats: ["qr_code"] });
      const scan = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes[0]?.rawValue) {
            const code = extractCode(codes[0].rawValue);
            stop();
            onDetected(code, quantity);
            return;
          }
        } catch {
          // The next frame usually succeeds while the camera warms up.
        }
        frameRef.current = requestAnimationFrame(scan);
      };
      frameRef.current = requestAnimationFrame(scan);
    } catch {
      setCameraError("Autorise la caméra, ou saisis le code client manuellement.");
      stop();
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!manual.trim()) return;
    onDetected(extractCode(manual), quantity);
    setManual("");
  }

  return (
    <div className="scanner-card">
      <div className="quantity-picker">
        <div><strong>Nombre de points</strong><small>Un point par menu ou achat</small></div>
        <div><button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={busy || cameraOpen || quantity === 1} aria-label="Retirer un point">−</button><output>{quantity}</output><button type="button" onClick={() => setQuantity((value) => Math.min(10, value + 1))} disabled={busy || cameraOpen || quantity === 10} aria-label="Ajouter un point">+</button></div>
      </div>
      <div className={`camera-frame ${cameraOpen ? "active" : ""}`}>
        <video ref={videoRef} playsInline muted />
        <div className="scan-corners"><i /><i /><i /><i /></div>
        {!cameraOpen && <div className="camera-empty"><span>▦</span><p>Cadre le QR personnel du client</p></div>}
      </div>
      <button className="button button-large button-full" onClick={cameraOpen ? stop : start} disabled={busy}>{cameraOpen ? "Fermer la caméra" : "Ouvrir la caméra"}</button>
      {cameraError && <p className="scanner-help" role="alert">{cameraError}</p>}
      <div className="or-divider"><span>ou</span></div>
      <form className="manual-code" onSubmit={submit}>
        <label htmlFor="manual-code">Code sous le QR</label>
        <div><input id="manual-code" value={manual} onChange={(event) => setManual(event.target.value.toUpperCase())} placeholder="EX. 7A9K2M4P" autoCapitalize="characters" /><button className="button" disabled={busy}>Valider</button></div>
      </form>
    </div>
  );
}
