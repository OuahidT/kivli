export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const normalizedCode = code.trim().toUpperCase();
  const manifest = {
    name: "Ma carte Kivli",
    short_name: "Kivli",
    description: "Ma carte de fidélité digitale Kivli.",
    start_url: `/c/${encodeURIComponent(normalizedCode)}`,
    scope: "/",
    display: "standalone",
    background_color: "#f4f1e9",
    theme_color: "#f05b3c",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };

  return Response.json(manifest, {
    headers: { "Cache-Control": "public, max-age=300", "Content-Type": "application/manifest+json; charset=utf-8" },
  });
}
