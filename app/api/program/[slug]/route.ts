import { getProgramBySlug } from "../../../../lib/data";
import { jsonError, safeApiError } from "../../../../lib/http";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const program = await getProgramBySlug(slug);
    return program ? Response.json({ program }) : jsonError("Programme introuvable.", 404);
  } catch (error) {
    return safeApiError(error);
  }
}
