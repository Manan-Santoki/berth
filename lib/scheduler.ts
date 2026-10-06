import "server-only";
import { listPolicies, runPolicy } from "./cleanup";
import { kvGet } from "./db";
import { pruneEvents } from "./events";

const DAY = 86_400_000;
const g = globalThis as unknown as { __berthScheduler?: NodeJS.Timeout };

async function tick() {
  for (const p of listPolicies()) {
    if (!p.enabled || p.schedule !== "daily") continue;
    if (p.last_run_at && Date.now() - p.last_run_at < DAY) continue;
    try {
      const { summary } = await runPolicy(p, "scheduler", false);
      console.log(`[berth] policy '${p.name}': ${summary}`);
    } catch (err) {
      console.error(`[berth] policy '${p.name}' failed:`, err);
    }
  }
  const retention = kvGet<number>("event_retention_days") ?? 90;
  if (retention > 0) pruneEvents(retention);
}

export function startScheduler() {
  if (g.__berthScheduler) return;
  // First pass shortly after boot, then every 15 minutes.
  setTimeout(() => void tick(), 60_000).unref();
  g.__berthScheduler = setInterval(() => void tick(), 15 * 60_000);
  g.__berthScheduler.unref();
}
