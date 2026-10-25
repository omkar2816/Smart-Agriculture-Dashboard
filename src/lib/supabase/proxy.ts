import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy session handler: direct dashboard access (no login required).
 * Any direct navigation to /login is automatically redirected to the root dashboard.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const path = request.nextUrl.pathname;
  if (path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next({ request });
}
