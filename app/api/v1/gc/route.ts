import { json, withApi } from "@/lib/api";
import { runGarbageCollect } from "@/lib/maintenance";

/** POST /api/v1/gc {"dryRun": true, "deleteUntagged": false} — starts garbage collection, returns the job id. */
export const POST = withApi("admin", async (req, principal) => {
  const body = (await req.json().catch(() => ({}))) as { dryRun?: boolean; deleteUntagged?: boolean };
  const jobId = await runGarbageCollect(principal.username, {
    dryRun: body.dryRun !== false,
    deleteUntagged: body.deleteUntagged === true,
  });
  return json({ jobId }, 202);
});
