"use client";
import { useEffect, useState } from "react";
import { Check, MailCheck, RefreshCw } from "lucide-react";
import { Brand } from "./Brand";
export function VerifyEmail() {
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Confirmation de ton adresse e-mail…");
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    fetch("/api/merchant/signup/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (response) => { const body = await response.json() as { error?: string }; if (!response.ok) throw new Error(body.error); setState("success"); setMessage("Ton adresse est confirmée. Ton espace Kivli est prêt."); window.setTimeout(() => { window.location.href = "/dashboard?welcome=1"; }, 1200); })
      .catch((error) => { setState("error"); setMessage(error instanceof Error ? error.message : "Ce lien n’est plus valide."); });
  }, []);
  return <main className="auth-page verify-page"><div className="auth-brand"><Brand /></div><section className="verify-card"><span className={`verify-icon ${state}`}>{state === "loading" ? <RefreshCw size={26} /> : state === "success" ? <Check size={26} /> : <MailCheck size={26} />}</span><span className="eyebrow">Validation du compte</span><h1>{state === "success" ? "Bienvenue chez Kivli." : state === "error" ? "Lien non valide." : "Un instant…"}</h1><p>{message}</p>{state === "error" && <a className="button button-large" href="/">Recommencer l’inscription</a>}</section></main>;
}
