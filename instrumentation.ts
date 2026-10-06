export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { failOrphanedJobs } = await import("./lib/jobs");
  const { ensureBootstrapAdmin } = await import("./lib/users");
  const { startScheduler } = await import("./lib/scheduler");
  const { env } = await import("./lib/env");

  if (!env.adminPassword) {
    console.warn("[berth] ADMIN_PASSWORD is not set: nobody can sign in and Berth can't authenticate to the registry.");
  }
  failOrphanedJobs();
  await ensureBootstrapAdmin().catch((err) => console.error("[berth] bootstrap admin sync failed:", err));
  startScheduler();
}
