import { json } from "@/lib/api";
import { ping } from "@/lib/registry/client";

export const dynamic = "force-dynamic";

/** Unauthenticated liveness probe. Reports registry reachability without details. */
export async function GET() {
  const registry = await ping();
  return json({ ok: true, registry: registry.ok ? "up" : "down" });
}
