"use server";

import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSession, destroySession, requireAdmin, requireUser, type Role } from "@/lib/auth/session";
import { deletePolicy, getPolicy, planPolicy, runPolicy, savePolicy, validatePolicy, type PlanItem, type PolicyInput } from "@/lib/cleanup";
import { kvSet } from "@/lib/db";
import { deleteReferences, deleteRepository, type DeleteResult } from "@/lib/images";
import { getJob, type Job } from "@/lib/jobs";
import { diskUsage, pruneEmptyRepositories, runGarbageCollect } from "@/lib/maintenance";
import { invalidateSnapshot } from "@/lib/registry/snapshot";
import { createToken, revokeToken } from "@/lib/tokens";
import { authenticate, createUser, deleteUser, generatePassword, loginThrottled, recordLoginFailure, setPassword, setRole } from "@/lib/users";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function attempt<T extends object>(fn: () => Promise<T> | T): Promise<ActionResult<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (err) {
    unstable_rethrow(err); // let redirect()/notFound() through
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Auth ────────────────────────────────────────────────────────────────────

export async function loginAction(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const key = `${ip}:${username}`;

  if (!username || !password) return { error: "Enter a username and password." };
  if (loginThrottled(key)) return { error: "Too many attempts. Try again in a few minutes." };
  if (!(await authenticate(username, password))) {
    recordLoginFailure(key);
    return { error: "Invalid username or password." };
  }
  await createSession(username);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

// ── Registry ────────────────────────────────────────────────────────────────

export async function refreshAction(path = "/") {
  await requireUser();
  invalidateSnapshot();
  revalidatePath(path, "layout");
}

export async function deleteImagesAction(repository: string, references: string[]): Promise<ActionResult<{ results: DeleteResult[] }>> {
  return attempt(async () => {
    const p = await requireAdmin();
    const results = await deleteReferences(p.username, repository, references);
    revalidatePath("/", "layout");
    return { results };
  });
}

export async function deleteRepositoryAction(repository: string): Promise<ActionResult<{ deletedImages: number; removed: boolean }>> {
  return attempt(async () => {
    const p = await requireAdmin();
    const r = await deleteRepository(p.username, repository);
    revalidatePath("/", "layout");
    return r;
  });
}

// ── Cleanup policies ────────────────────────────────────────────────────────

function parsePolicy(form: FormData): PolicyInput {
  const older = String(form.get("older_than_days") ?? "").trim();
  return {
    name: String(form.get("name") ?? "").trim(),
    repo_pattern: String(form.get("repo_pattern") ?? "*").trim() || "**",
    tag_pattern: String(form.get("tag_pattern") ?? ".*").trim() || ".*",
    protect_pattern: String(form.get("protect_pattern") ?? "").trim(),
    keep_last: Number.parseInt(String(form.get("keep_last") ?? "10"), 10),
    older_than_days: older ? Number.parseInt(older, 10) : null,
    schedule: form.get("schedule") === "daily" ? "daily" : "manual",
    enabled: form.get("enabled") === "off" ? 0 : 1,
  };
}

export async function savePolicyAction(id: number | null, form: FormData): Promise<ActionResult<{ id: number }>> {
  return attempt(async () => {
    const p = await requireAdmin();
    const input = parsePolicy(form);
    const invalid = validatePolicy(input);
    if (invalid) throw new Error(invalid);
    const saved = savePolicy(input, id ?? undefined);
    const { audit } = await import("@/lib/audit");
    audit(p.username, id ? "policy.update" : "policy.create", input.name);
    revalidatePath("/cleanup");
    return { id: saved };
  });
}

export async function previewPolicyAction(form: FormData): Promise<ActionResult<{ plan: PlanItem[] }>> {
  return attempt(async () => {
    await requireAdmin();
    const input = parsePolicy(form);
    const invalid = validatePolicy({ ...input, name: input.name || "preview" });
    if (invalid) throw new Error(invalid);
    return { plan: await planPolicy(input) };
  });
}

export async function runPolicyAction(id: number, dryRun: boolean): Promise<ActionResult<{ summary: string; jobId: number }>> {
  return attempt(async () => {
    const p = await requireAdmin();
    const policy = getPolicy(id);
    if (!policy) throw new Error("Policy not found.");
    const r = await runPolicy(policy, p.username, dryRun);
    revalidatePath("/", "layout");
    return r;
  });
}

export async function deletePolicyAction(id: number): Promise<ActionResult> {
  return attempt(async () => {
    const p = await requireAdmin();
    const policy = getPolicy(id);
    deletePolicy(id);
    const { audit } = await import("@/lib/audit");
    audit(p.username, "policy.delete", policy?.name);
    revalidatePath("/cleanup");
    return {};
  });
}

// ── Maintenance ─────────────────────────────────────────────────────────────

export async function runGcAction(dryRun: boolean, deleteUntagged: boolean): Promise<ActionResult<{ jobId: number }>> {
  return attempt(async () => {
    const p = await requireAdmin();
    return { jobId: await runGarbageCollect(p.username, { dryRun, deleteUntagged }) };
  });
}

export async function getJobAction(id: number): Promise<Job | null> {
  await requireUser();
  return getJob(id);
}

export async function measureDiskAction(): Promise<ActionResult> {
  return attempt(async () => {
    await requireUser();
    await diskUsage({ fresh: true });
    revalidatePath("/maintenance");
    return {};
  });
}

export async function pruneEmptyReposAction(names: string[]): Promise<ActionResult<{ removed: string[] }>> {
  return attempt(async () => {
    const p = await requireAdmin();
    const removed = await pruneEmptyRepositories(p.username, names);
    revalidatePath("/", "layout");
    return { removed };
  });
}

export async function setEventRetentionAction(days: number): Promise<ActionResult> {
  return attempt(async () => {
    await requireAdmin();
    if (!Number.isInteger(days) || days < 0) throw new Error("Retention must be 0 (keep forever) or more days.");
    kvSet("event_retention_days", days);
    revalidatePath("/settings");
    return {};
  });
}

// ── Users & tokens ──────────────────────────────────────────────────────────

export async function createUserAction(username: string, password: string, role: Role): Promise<ActionResult<{ password: string }>> {
  return attempt(async () => {
    const p = await requireAdmin();
    const pw = password || generatePassword();
    await createUser(p.username, username.trim(), pw, role);
    revalidatePath("/users");
    return { password: pw };
  });
}

export async function resetPasswordAction(username: string, password: string): Promise<ActionResult<{ password: string }>> {
  return attempt(async () => {
    const p = await requireAdmin();
    const pw = password || generatePassword();
    await setPassword(p.username, username, pw);
    revalidatePath("/users");
    return { password: pw };
  });
}

export async function setRoleAction(username: string, role: Role): Promise<ActionResult> {
  return attempt(async () => {
    const p = await requireAdmin();
    setRole(p.username, username, role);
    revalidatePath("/users");
    return {};
  });
}

export async function deleteUserAction(username: string): Promise<ActionResult> {
  return attempt(async () => {
    const p = await requireAdmin();
    if (username === p.username) throw new Error("You can't delete yourself.");
    deleteUser(p.username, username);
    revalidatePath("/users");
    return {};
  });
}

export async function createTokenAction(name: string, role: Role): Promise<ActionResult<{ token: string }>> {
  return attempt(async () => {
    const p = await requireAdmin();
    const token = createToken(p.username, name, role);
    revalidatePath("/settings");
    return { token };
  });
}

export async function revokeTokenAction(id: number): Promise<ActionResult> {
  return attempt(async () => {
    const p = await requireAdmin();
    revokeToken(p.username, id);
    revalidatePath("/settings");
    return {};
  });
}
