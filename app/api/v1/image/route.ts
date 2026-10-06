import { apiError, json, withApi } from "@/lib/api";
import { deleteReferences } from "@/lib/images";
import { getImageDetail } from "@/lib/registry/snapshot";

function params(req: Request) {
  const sp = new URL(req.url).searchParams;
  return { repository: sp.get("repository"), reference: sp.get("reference") };
}

/** GET /api/v1/image?repository=x&reference=tag|digest — manifest, platforms, config, history. */
export const GET = withApi("viewer", async (req) => {
  const { repository, reference } = params(req);
  if (!repository || !reference) return apiError("Query parameters 'repository' and 'reference' are required", 400);
  const detail = await getImageDetail(repository, reference);
  return json({ ...detail, raw: undefined });
});

/** DELETE /api/v1/image?repository=x&reference=tag|digest — deletes the manifest (all tags sharing its digest). */
export const DELETE = withApi("admin", async (req, principal) => {
  const { repository, reference } = params(req);
  if (!repository || !reference) return apiError("Query parameters 'repository' and 'reference' are required", 400);
  const results = await deleteReferences(principal.username, repository, [reference]);
  return json({ deleted: results });
});
