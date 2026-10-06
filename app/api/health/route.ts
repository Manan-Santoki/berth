import { json } from "@/lib/api";
import { ping } from "@/lib/registry/client";

export const dynamic = "force-dynamic";

/**
 * Unauthenticated liveness probe. It must not depend on the registry: in the
 * bundled compose the registry waits for Berth to be healthy before starting.
 * Pass ?registry=1 to also report registry reachability.
 */
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("registry") !== "1") return json({ ok: true });
  const registry = await ping();
  return json({ ok: true, registry: registry.ok ? "up" : "down" });
}
