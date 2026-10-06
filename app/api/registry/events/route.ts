import crypto from "node:crypto";
import { apiError, json } from "@/lib/api";
import { env } from "@/lib/env";
import { ingestEvents, type RegistryNotification } from "@/lib/events";
import { invalidateSnapshot } from "@/lib/registry/snapshot";

/**
 * Receives distribution notification webhooks. Configure the registry with
 * `notifications.endpoints[].url = <berth>/api/registry/events` and an
 * `Authorization: Bearer <WEBHOOK_TOKEN>` header.
 */
export async function POST(req: Request) {
  if (!env.webhookToken) return apiError("Webhooks are disabled (WEBHOOK_TOKEN is not set)", 404);
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${env.webhookToken}`);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return apiError("Unauthorized", 401);

  let body: { events?: RegistryNotification[] };
  try {
    body = await req.json();
  } catch {
    return apiError("Body must be a JSON notification envelope", 400);
  }
  const events = Array.isArray(body.events) ? body.events : [];
  const stored = ingestEvents(events);
  if (events.some((e) => e.action === "push" || e.action === "delete")) invalidateSnapshot();
  return json({ received: events.length, stored });
}
