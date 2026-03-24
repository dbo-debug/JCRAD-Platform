import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Site-wide age gate:
  // If age verification cookie is missing, redirect to /age-gate for all
  // non-exempt paths. This runs before auth checks.
  const isExemptPath =
    pathname === "/age-gate" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/assets") ||
    pathname === "/login" ||
    pathname.startsWith("/auth/");

  const hasAgeVerification = request.cookies.get("age_verified")?.value === "true";
  if (!hasAgeVerification && !isExemptPath) {
    const gateUrl = request.nextUrl.clone();
    gateUrl.pathname = "/age-gate";
    gateUrl.search = "";
    gateUrl.searchParams.set("returnTo", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(gateUrl);
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (pathname.startsWith("/admin")) {
    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("returnTo", `${request.nextUrl.pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = String(profile?.role || "").trim().toLowerCase();
    const isStaff = role === "admin" || role === "sales";

    if (!isStaff) {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = "/dashboard";
      dashboardUrl.search = "";
      return NextResponse.redirect(dashboardUrl);
    }

    if (role !== "admin" && pathname !== "/admin") {
      const commandCenterUrl = request.nextUrl.clone();
      commandCenterUrl.pathname = "/admin";
      commandCenterUrl.search = "";
      return NextResponse.redirect(commandCenterUrl);
    }

    return response;
  }

  // Keep the existing Supabase auth behavior limited to /portal paths only.
  // Other routes should continue without portal auth enforcement.
  if (!pathname.startsWith("/portal")) {
    return response;
  }

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("returnTo", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/:path*"],
};
