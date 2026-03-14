import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { getUserAndProfile } from "@/lib/auth/getUserAndProfile";
import { normalizePackagingCategory, type PackagingCategory } from "@/lib/packaging/category";
import { createClient } from "@/lib/supabase/server";
import CustomerLogoCard from "./customer-logo-card";

type EstimateRow = {
  id: string;
  status: string | null;
  total: number | null;
  packaging_review_pending: boolean;
  created_at: string | null;
  updated_at: string | null;
};

type PackagingSubmissionRow = {
  id: string;
  category: string | null;
  status: string | null;
};

const QUICK_START_PRODUCTS = [
  {
    title: "Infused 1g preroll",
    description: "Start a pre-roll estimate with infusion assumptions.",
    href: "/estimate?preset=infused-1g-preroll",
  },
  {
    title: "1g AIO",
    description: "Open a vape estimate pathway for 1g all-in-one programs.",
    href: "/estimate?preset=1g-aio",
  },
  {
    title: "Top shelf 5 lb 1/8th in mylar run",
    description: "Begin a flower packout estimate for premium 3.5g output.",
    href: "/estimate?preset=top-shelf-5lb-eighth-mylar",
  },
  {
    title: "5 lb 7g indoor smalls mylar run",
    description: "Quick-start a value-oriented flower run estimate.",
    href: "/estimate?preset=5lb-7g-indoor-smalls-mylar",
  },
] as const;

function formatDate(value: string | null): string {
  if (!value) return "Date pending";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "Date pending";
  return new Date(time).toLocaleDateString();
}

function formatCurrency(value: number | null): string {
  if (!Number.isFinite(Number(value))) return "Pending total";
  return Number(value).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export default async function DashboardPage() {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login?returnTo=/dashboard");

  const role = String((profile as any)?.role || "customer").toLowerCase();
  if (role === "admin") redirect("/admin");
  if (role === "sales" || role === "employee") redirect("/portal");

  const companyName = String((profile as any)?.company_name || "").trim() || "Your team";
  const initialLogo = {
    logo_url: String((profile as any)?.logo_url || "").trim() || null,
    logo_bucket: String((profile as any)?.logo_bucket || "").trim() || null,
    logo_object_path: String((profile as any)?.logo_object_path || "").trim() || null,
  };
  const supabase = await createClient();

  let recentEstimates: EstimateRow[] = [];
  let estimateLoadFailed = false;
  let packagingWorkflow = {
    pending: 0,
    approved: 0,
    rejected: 0,
    byCategory: {
      vape: 0,
      flower: 0,
      pre_roll: 0,
      concentrate: 0,
    } as Record<PackagingCategory, number>,
  };

  if (user.email) {
    const { data, error } = await supabase
      .from("estimates")
      .select("id, status, total, packaging_review_pending, created_at, updated_at")
      .eq("customer_email", user.email)
      .order("updated_at", { ascending: false })
      .limit(4);

    if (error) {
      estimateLoadFailed = true;
    } else {
      recentEstimates = ((data || []) as EstimateRow[]).map((row) => ({
        id: String(row.id || ""),
        status: row.status ? String(row.status) : "draft",
        total: Number.isFinite(Number(row.total)) ? Number(row.total) : null,
        packaging_review_pending: row.packaging_review_pending === true,
        created_at: row.created_at ? String(row.created_at) : null,
        updated_at: row.updated_at ? String(row.updated_at) : null,
      }));
    }
  }

  if (user.email) {
    const { data: submissionRows, error: submissionErr } = await supabase
      .from("packaging_submissions")
      .select("id, category, status")
      .eq("customer_email", String(user.email).toLowerCase())
      .order("created_at", { ascending: false })
      .limit(200);
    if (!submissionErr) {
      for (const row of (submissionRows || []) as PackagingSubmissionRow[]) {
        const status = String(row.status || "pending").toLowerCase();
        if (status === "approved") packagingWorkflow.approved += 1;
        else if (status === "rejected") packagingWorkflow.rejected += 1;
        else packagingWorkflow.pending += 1;

        const category = normalizePackagingCategory(row.category);
        if (category) packagingWorkflow.byCategory[category] += 1;
      }
    }
  }

  const placeholderProjects = [
    { title: "Pending flower packout", subtitle: "Confirm packaging format and unit size assumptions." },
    { title: "Pending vape launch run", subtitle: "Align hardware selection and estimated fill volume." },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="space-y-2">
          <h1 className="text-3xl font-semibold text-[#13303f]">Customer Dashboard</h1>
          <p className="text-[#4a6575]">Welcome back, {companyName}. Use this workspace to plan projects and move toward order-ready execution.</p>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="border border-[var(--surface-border)] bg-white p-6 text-[var(--text)] shadow-sm lg:col-span-2">
            <h2 className="text-lg font-semibold text-[#173543]">Account summary</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5d7685]">Signed in</p>
                <p className="mt-1 text-sm font-medium text-[#173543]">{user.email}</p>
              </div>
              <div className="rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5d7685]">Account type</p>
                <p className="mt-1 text-sm font-medium capitalize text-[#173543]">{role}</p>
              </div>
            </div>
          </Card>

          <Card className="border border-[var(--surface-border)] bg-white p-6 text-[var(--text)] shadow-sm">
            <h2 className="text-lg font-semibold text-[#173543]">Onboarding upload</h2>
            <p className="mt-2 text-sm text-[#4a6575]">Upload compliance documents so your estimates can move into order-ready workflow.</p>
            <div className="mt-4">
              <Link href="/portal/onboarding">
                <Button className="rounded-full bg-[#14b8a6] text-white hover:bg-[#14b8a6]">Complete onboarding</Button>
              </Link>
            </div>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="border border-[var(--surface-border)] bg-white p-6 text-[var(--text)] shadow-sm lg:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-[#173543]">Pending projects</h2>
              <Link href="/estimate" className="text-sm font-semibold text-[#0f766e] underline underline-offset-4">
                Open estimator
              </Link>
            </div>

            {recentEstimates.length > 0 ? (
              <div className="mt-4 space-y-3">
                {recentEstimates.map((estimate) => (
                  <div key={estimate.id} className="rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[#173543]">Estimate #{estimate.id.slice(0, 8)}</p>
                      <span className="rounded-full border border-[#d4e2e9] bg-white px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-[#5d7685]">
                        {estimate.status || "draft"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[#4a6575]">Updated {formatDate(estimate.updated_at || estimate.created_at)}</p>
                    <p className="mt-1 text-sm font-semibold text-[#153447]">{formatCurrency(estimate.total)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {placeholderProjects.map((project) => (
                  <div key={project.title} className="rounded-xl border border-dashed border-[#d3e1e8] bg-[#f9fcfd] px-4 py-3">
                    <p className="text-sm font-semibold text-[#173543]">{project.title}</p>
                    <p className="mt-1 text-sm text-[#4a6575]">{project.subtitle}</p>
                  </div>
                ))}
                {estimateLoadFailed ? (
                  <p className="text-xs text-[#5d7685]">Recent estimates are unavailable right now. Start a new estimate to begin tracking projects.</p>
                ) : null}
              </div>
            )}
          </Card>

          <Card className="border border-[var(--surface-border)] bg-white p-6 text-[var(--text)] shadow-sm">
            <h2 className="text-lg font-semibold text-[#173543]">Logo upload</h2>
            <p className="mt-2 text-sm text-[#4a6575]">Upload your brand logo for JC RAD production and copacking use.</p>
            <div className="mt-4">
              <CustomerLogoCard initialLogo={initialLogo} />
            </div>
          </Card>
        </section>

        <section>
          <Card className="border border-[var(--surface-border)] bg-white p-6 text-[var(--text)] shadow-sm">
            <h2 className="text-lg font-semibold text-[#173543]">Packaging workflow</h2>
            <p className="mt-2 text-sm text-[#4a6575]">
              Upload reusable customer packaging by category. Orders stay blocked until required category submissions are approved.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-[#dbe9ef] bg-[#fff9ed] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8a5a08]">Pending</p>
                <p className="mt-1 text-sm font-semibold text-[#5f3b07]">{packagingWorkflow.pending}</p>
              </div>
              <div className="rounded-xl border border-[#dbe9ef] bg-[#fff8e7] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a6a15]">Rejected</p>
                <p className="mt-1 text-sm font-semibold text-[#7a4f11]">{packagingWorkflow.rejected}</p>
              </div>
              <div className="rounded-xl border border-[#dbe9ef] bg-[#eefaf8] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#0f766e]">Approved</p>
                <p className="mt-1 text-sm font-semibold text-[#155e75]">{packagingWorkflow.approved}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#4a6575]">
              <span>Vape: {packagingWorkflow.byCategory.vape}</span>
              <span>Flower: {packagingWorkflow.byCategory.flower}</span>
              <span>Pre-roll: {packagingWorkflow.byCategory.pre_roll}</span>
              <span>Concentrate: {packagingWorkflow.byCategory.concentrate}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/dashboard/packaging">
                <Button className="rounded-full bg-[#14b8a6] text-white hover:bg-[#14b8a6]">Upload packaging files</Button>
              </Link>
              <Link href="/estimate" className="inline-flex items-center rounded-full border border-[#cfdce4] px-4 py-2 text-sm font-semibold text-[#24404d] transition hover:border-[#14b8a6] hover:text-[#0f766e]">
                Review estimate status
              </Link>
            </div>
          </Card>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-[#13303f]">Featured quick-start products</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {QUICK_START_PRODUCTS.map((item) => (
              <Card key={item.title} className="border border-[var(--surface-border)] bg-white p-5 text-[var(--text)] shadow-sm">
                <h3 className="text-base font-semibold text-[#173543]">{item.title}</h3>
                <p className="mt-2 text-sm text-[#4a6575]">{item.description}</p>
                <div className="mt-4">
                  <Link href={item.href} className="text-sm font-semibold text-[#0f766e] underline underline-offset-4">
                    Start estimate pathway
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
