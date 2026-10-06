import { json, withApi } from "@/lib/api";
import { listEvents } from "@/lib/events";

/** GET /api/v1/events?repository=&action=push|pull|delete&tag=&limit=&offset= */
export const GET = withApi("viewer", async (req) => {
  const sp = new URL(req.url).searchParams;
  const limit = Math.min(500, Math.max(1, Number(sp.get("limit") ?? 50) || 50));
  const offset = Math.max(0, Number(sp.get("offset") ?? 0) || 0);
  const { rows, total } = listEvents({
    repository: sp.get("repository") ?? undefined,
    action: sp.get("action") ?? undefined,
    tag: sp.get("tag") ?? undefined,
    limit,
    offset,
  });
  return json({ total, limit, offset, events: rows.map((r) => ({ ...r, ts: new Date(r.ts).toISOString() })) });
});
