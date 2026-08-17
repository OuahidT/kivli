# Vidéo TikTok Kivli

`kivli-tiktok.mp4` — 1080×1920 (9:16), 30 fps, ~28 s, H.264, sans son. Prête à poster.

Chaque écran visible dans la vidéo est une **vraie capture** de l'app en fonctionnement
(aucune reconstruction d'UI) : compte de démo « Atelier Nova », programme 8 passages,
récompense « Un avantage au choix », couleur `#f05b3c`, cliente « Léa » et 12 autres
clients aux progressions variées (13 clients · 77 passages · 4 récompenses au dashboard).

## Structure (~28 s)

| Temps | Scène | Source |
|---|---|---|
| 0–3 s | Hook : la carte papier (perdue, froissée, oubliée) | Motion design (carte papier générique, pas l'UI) |
| 3–7 s | Reveal : la carte Kivli prend vie (0/8 → 6/8) | Captures réelles `/c/[code]` |
| 7–10.5 s | Étape 1 : QR code d'inscription + stats | Capture réelle `/dashboard` (vue d'ensemble) |
| 10.5–14 s | Étape 2 : le client crée sa carte | Capture réelle `/join/[slug]` |
| 14–18 s | Étape 3 : scan + modale « +1 point ajouté » | Captures réelles onglet Scanner + vraie modale |
| 18–21.5 s | Récompense débloquée (« Bravo Léa ! ») + carte 8/8 | Vraies modale et carte, confettis |
| 21.5–25.5 s | Bénéfices : 0 € · 1 min · Sans app | Claims exacts du site |
| 25.5–28 s | CTA : logo réel, kivli.fr, vrai bouton « Créer mon compte » | `public/icon.svg` + crop de la landing |

## Reproduction

1. Lancer l'app en local (`pnpm install && pnpm run dev`).
   En local, abaisser temporairement `compatibility_date` dans `wrangler.jsonc` si le
   runtime miniflare installé ne supporte pas la date de prod (ne pas committer).
2. `node scripts/seed.mjs` — crée marchand, programme, clients de démo.
3. `node scripts/capture.mjs` (+ `capture2/3.mjs`) — captures Playwright,
   viewport mobile 430×932 @3x (chromium : `/opt/pw-browsers/chromium` ou local).
4. `node scripts/render.mjs` — compose `scripts/comp.html` image par image
   (840 frames, easings/spring/parallax déterministes) et encode en H.264 via ffmpeg
   (`imageio-ffmpeg`). Adapter les chemins d'assets en tête de `comp.html`
   (`frameImg`, `SHOTS`, bouton CTA) vers `shots/` avant de relancer.
   `node scripts/preview.mjs [frames…]` génère des stills de contrôle.

Les captures sources clés sont dans `shots/`.
