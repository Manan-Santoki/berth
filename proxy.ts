import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate only: sends visitors without a session cookie to /login.
 * Every page, action and API route still verifies the session itself.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("berth_session")) {
    const url = new URL("/login", request.url);
    const next = request.nextUrl.pathname + request.nextUrl.search;
    if (next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api/|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
