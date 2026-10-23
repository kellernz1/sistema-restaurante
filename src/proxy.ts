import { NextResponse, type NextRequest } from "next/server";

import {
  getAllowedRoles,
  isStaffRoute,
  ROLE_DASHBOARDS,
  type UserRole,
} from "@/lib/auth";
import { updateSession } from "@/utils/supabase/middleware";

function copyCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  return target;
}

function redirectWithCookies(
  request: NextRequest,
  destination: string,
  sourceResponse: NextResponse,
) {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = destination;
  redirectUrl.search = "";

  return copyCookies(sourceResponse, NextResponse.redirect(redirectUrl));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isStaffRoute(pathname) && pathname !== "/login") return NextResponse.next();
  const { response, supabase, user } = await updateSession(request);
  const staffRoute = isStaffRoute(pathname);

  if (!user) {
    if (staffRoute) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = "";
      loginUrl.searchParams.set("next", pathname);

      return copyCookies(response, NextResponse.redirect(loginUrl));
    }

    return response;
  }

  if (!staffRoute && pathname !== "/login") {
    return response;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role as UserRole | undefined;
  if (!role) {
    return redirectWithCookies(request, "/unauthorized", response);
  }

  if (pathname === "/login") {
    return redirectWithCookies(request, ROLE_DASHBOARDS[role], response);
  }

  const allowedRoles = getAllowedRoles(pathname);
  if (role !== "admin" && allowedRoles && !allowedRoles.includes(role)) {
    return redirectWithCookies(request, ROLE_DASHBOARDS[role], response);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
