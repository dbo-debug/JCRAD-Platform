import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const STATIC_FILE_EXTENSION =
  /\.(?:png|jpe?g|gif|webp|svg|ico|css|js|map|woff2?|ttf)$/i;

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const isProtectedApplicationPath =
    pathname === "/workspace" ||
    pathname.startsWith("/workspace/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/portal" ||
    pathname.startsWith("/portal/") ||
    pathname === "/auth" ||
    pathname.startsWith("/auth/") ||
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/estimate" ||
    pathname.startsWith("/estimate/") ||
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/menu" ||
    pathname.startsWith("/menu/");

  const isPublicStaticAsset =
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/_next/image/") ||
    pathname.startsWith("/brand/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    (!isProtectedApplicationPath && STATIC_FILE_EXTENSION.test(pathname));

  if (isPublicStaticAsset) {
    return NextResponse.next();
  }

  const isEstimatorPath =
    pathname === "/estimate" ||
    pathname.startsWith("/estimate/") ||
    pathname === "/dashboard" ||
    pathname.startsWith("/api/estimate/") ||
    pathname.startsWith("/api/workspace/estimates/") ||
    pathname.startsWith("/api/admin/estimate-lines/") ||
    pathname === "/api/settings/yields" ||
    pathname === "/api/production/finalize-line";
  const isDisabledCatalogPath =
    pathname === "/menu" ||
    pathname.startsWith("/menu/") ||
    pathname.startsWith("/api/admin/catalog-items") ||
    pathname.startsWith("/api/admin/offers") ||
    pathname.startsWith("/api/admin/packaging") ||
    pathname.startsWith("/api/admin/product") ||
    pathname === "/api/admin/settings/estimator" ||
    pathname === "/api/admin/settings/pricing" ||
    pathname === "/api/admin/settings/yields" ||
    pathname.startsWith("/api/admin/upload-variant-media") ||
    pathname.startsWith("/api/admin/variant-media") ||
    pathname.startsWith("/api/variant-media") ||
    pathname.startsWith("/api/packaging") ||
    pathname.startsWith("/api/order/");

  if (isEstimatorPath || isDisabledCatalogPath) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: isEstimatorPath ? "Estimator is temporarily disabled." : "Catalog functionality is temporarily disabled." },
        { status: 410 }
      );
    }
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

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
    pathname === "/crm" ||
    pathname.startsWith("/crm/") ||
    pathname.startsWith("/workspace") ||
    pathname.startsWith("/admin") ||
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
      loginUrl.pathname = "/crm/login";
      loginUrl.searchParams.set("returnTo", `${request.nextUrl.pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    }
    const crmUrl = request.nextUrl.clone();
    crmUrl.pathname = "/workspace/customers";
    crmUrl.search = "";
    return NextResponse.redirect(crmUrl);
  }

  if (pathname.startsWith("/workspace") && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/crm/login";
    loginUrl.searchParams.set("returnTo", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  // Keep the existing customer Supabase auth behavior limited to /portal paths.
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
