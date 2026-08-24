import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

import { isAllowedAdminEmail } from "@/lib/admin/auth";

export const config = {
  /*
   * Match all request paths except for the ones starting with:
   * - api (API routes)
   * - _next/static (static files)
   * - _next/image (image optimization files)
   * - favicon.ico (favicon file)
   * But we want to protect /admin and /api/admin, so we will specify them.
   */
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};

export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === "/admin/sign-in") {
    return NextResponse.next();
  }

  const nextAuthSecret = process.env.NEXTAUTH_SECRET;
  if (nextAuthSecret && process.env.ADMIN_GOOGLE_EMAIL) {
    try {
      const token = await getToken({ req, secret: nextAuthSecret });
      if (isAllowedAdminEmail(token?.email, process.env.ADMIN_GOOGLE_EMAIL)) {
        return NextResponse.next();
      }
    } catch {
      // Fall through to the unauthenticated response below.
    }
  }

  // Browser navigation should return to the branded sign-in page. API clients
  // receive 401.
  if (!req.nextUrl.pathname.startsWith("/api/admin/")) {
    const signInUrl = req.nextUrl.clone();
    signInUrl.pathname = "/admin/sign-in";
    signInUrl.search = "";
    signInUrl.searchParams.set(
      "callbackUrl",
      `${req.nextUrl.pathname}${req.nextUrl.search}`,
    );
    return NextResponse.redirect(signInUrl);
  }

  return new NextResponse("Authentication required.", { status: 401 });
}
