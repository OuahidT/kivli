"use client";

import jsQR from "jsqr";
import { Camera, Check, Keyboard, Minus, Plus, ScanLine, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastScanRef = useRef(0);
  const startingRef = useRef(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [manual, setManual] = useState("");
  const [quantity, setQuantity] = useState(1);

  function releaseCamera() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    startingRef.current = false;
  }

  function stop() {
    releaseCamera();
    setCameraOpen(false);
  }

  useEffect(() => () => releaseCamera(), []);

  async function start() {
    if (startingRef.current) return;
    startingRef.current = true;
    setCameraError("");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      startingRef.current = false;
      setCameraError("Le scan caméra n’est pas disponible ici. Saisis le code affiché sous le QR.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) {
        releaseCamera();
        setCameraError("Impossible d’initialiser le scanner. Réessaie dans un instant.");
        return;
      }
      video.srcObject = stream;
      await video.play();
      startingRef.current = false;
      setCameraOpen(true);

      const scan = (now: number) => {
        if (!streamRef.current || !videoRef.current) return;
        if (now - lastScanRef.current >= 120 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
          lastScanRef.current = now;
          const maxWidth = 720;
          const scale = Math.min(1, maxWidth / video.videoWidth);
          const width = Math.max(1, Math.round(video.videoWidth * scale));
          const height = Math.max(1, Math.round(video.videoHeight * scale));
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (context) {
            context.drawImage(video, 0, 0, width, height);
            const frame = context.getImageData(0, 0, width, height);
            const result = jsQR(frame.data, width, height, { inversionAttempts: "dontInvert" });
            if (result?.data) {
              const code = extractCode(result.data);
              stop();
              onDetected(code, quantity);
              return;
            }
          }
        }
        frameRef.current = requestAnimationFrame(scan);
      };
      frameRef.current = requestAnimationFrame(scan);
    } catch (error) {
      releaseCamera();
      setCameraOpen(false);
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setCameraError("La caméra est bloquée. Autorise-la dans les réglages du navigateur, puis réessaie.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setCameraError("Aucune caméra utilisable n’a été trouvée. Saisis le code affiché sous le QR.");
      } else {
        setCameraError("La caméra n’a pas pu démarrer. Réessaie, ou saisis le code client manuellement.");
      }
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
        <div><button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={busy || cameraOpen || quantity === 1} aria-label="Retirer un point"><Minus size={19} aria-hidden="true" /></button><output>{quantity}</output><button type="button" onClick={() => setQuantity((value) => Math.min(10, value + 1))} disabled={busy || cameraOpen || quantity === 10} aria-label="Ajouter un point"><Plus size={19} aria-hidden="true" /></button></div>
      </div>
      <div className={`camera-frame ${cameraOpen ? "active" : ""}`}>
        <video ref={videoRef} playsInline muted />
        <canvas ref={canvasRef} hidden aria-hidden="true" />
        <div className="scan-corners"><i /><i /><i /><i /></div>
        {!cameraOpen && <div className="camera-empty"><span><ScanLine size={30} aria-hidden="true" /></span><p>Cadre le QR personnel du client</p><small>Le scan démarre dès l’ouverture</small></div>}
      </div>
      <button className="button button-large button-full camera-button" onClick={cameraOpen ? stop : start} disabled={busy}>{cameraOpen ? <X size={19} aria-hidden="true" /> : <Camera size={19} aria-hidden="true" />}{cameraOpen ? "Fermer la caméra" : "Ouvrir la caméra"}</button>
      {cameraError && <p className="scanner-help" role="alert">{cameraError}</p>}
      <div className="or-divider"><span>ou</span></div>
      <form className="manual-code" onSubmit={submit}>
        <label htmlFor="manual-code"><Keyboard size={16} aria-hidden="true" />Code sous le QR</label>
        <div><input id="manual-code" value={manual} onChange={(event) => setManual(event.target.value.toUpperCase())} placeholder="EX. 7A9K2M4P" autoCapitalize="characters" /><button className="button" disabled={busy}><Check size={17} aria-hidden="true" />Valider</button></div>
      </form>
    </div>
  );
}
