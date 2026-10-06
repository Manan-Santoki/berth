import "server-only";
import { NextResponse } from "next/server";
import { currentPrincipal, type Principal } from "./auth/session";
import { RegistryError } from "./registry/client";

export function json(data: unknown, init?: number | ResponseInit) {
  return NextResponse.json(data, typeof init === "number" ? { status: init } : init);
}

export function apiError(message: string, status: number) {
  return json({ error: message }, status);
}

/**
 * Wraps an API handler with authentication (session cookie or `Bearer berth_…`
 * token), role checks and uniform error responses.
 */
export function withApi<C>(
  role: "viewer" | "admin",
  handler: (req: Request, principal: Principal, ctx: C) => Promise<Response>,
) {
  return async (req: Request, ctx: C) => {
    const principal = await currentPrincipal();
    if (!principal) return apiError("Unauthorized", 401);
    if (role === "admin" && principal.role !== "admin") return apiError("Admin role required", 403);
    try {
      return await handler(req, principal, ctx);
    } catch (err) {
      if (err instanceof RegistryError) return apiError(err.message, err.status && err.status >= 400 ? err.status : 502);
      return apiError(err instanceof Error ? err.message : String(err), 500);
    }
  };
}
