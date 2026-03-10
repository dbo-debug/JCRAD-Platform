import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import Card from "@/components/ui/Card";
import { getUserAndProfile } from "@/lib/auth/getUserAndProfile";
import { safeInternalReturnTo } from "@/lib/auth/canAccessEstimator";
import {
  normalizePackagingCategory,
  packagingCategoryLabel,
  type PackagingCategory,
} from "@/lib/packaging/category";
import { createClient } from "@/lib/supabase/server";
import PackagingUploadClient from "./packaging-upload-client";

type SubmissionRow = {
  id: string;
  category: string | null;
  status: string | null;
  notes: string | null;
  review_notes: string | null;
  front_image_url: string | null;
  back_image_url: string | null;
  created_at: string | null;
};

type PageProps = {
  searchParams?: {
    category?: string;
    returnTo?: string;
  };
};

export default async function DashboardPackagingPage({ searchParams }: PageProps) {
  const { user, profile } = await getUserAndProfile();
  if (!user) {
    redirect("/login?returnTo=/dashboard/packaging");
  }

  const role = String((profile as any)?.role || "customer").toLowerCase();
  if (role === "admin") redirect("/admin");
  if (role === "sales" || role === "employee") redirect("/portal");

  const returnTo = safeInternalReturnTo(searchParams?.returnTo || "/dashboard");
  const requestedCategory = normalizePackagingCategory(searchParams?.category || "");
  const supabase = await createClient();

  const { data: submissionRows } = await supabase
    .from("packaging_submissions")
    .select("id, category, status, notes, review_notes, front_image_url, back_image_url, created_at")
    .eq("customer_email", String(user.email || "").toLowerCase())
    .order("created_at", { ascending: false })
    .limit(200);

  const submissions = ((submissionRows || []) as SubmissionRow[]).map((row) => ({
    id: String(row.id || ""),
    category: normalizePackagingCategory(row.category),
    status: String(row.status || "pending").toLowerCase(),
    notes: row.notes ? String(row.notes) : "",
    review_notes: row.review_notes ? String(row.review_notes) : "",
    front_image_url: row.front_image_url ? String(row.front_image_url) : null,
    back_image_url: row.back_image_url ? String(row.back_image_url) : null,
    created_at: row.created_at ? String(row.created_at) : null,
  }));

  const normalizedSubmissions = submissions.filter((row) => row.category) as Array<
    Omit<(typeof submissions)[number], "category"> & { category: PackagingCategory }
  >;

  const defaultCategory = requestedCategory || "vape";

  const byCategorySummary = new Map<PackagingCategory, { pending: number; approved: number; rejected: number }>();
  for (const category of ["vape", "flower", "pre_roll", "concentrate"] as PackagingCategory[]) {
    byCategorySummary.set(category, { pending: 0, approved: 0, rejected: 0 });
  }

  for (const row of normalizedSubmissions) {
    const bucket = byCategorySummary.get(row.category);
    if (!bucket) continue;
    if (row.status === "approved") bucket.approved += 1;
    else if (row.status === "rejected") bucket.rejected += 1;
    else bucket.pending += 1;
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <section className="space-y-2">
          <h1 className="text-3xl font-semibold text-[#13303f]">Packaging Upload</h1>
          <p className="text-sm text-[#4a6575]">
            Submit reusable customer packaging artwork by category. Front and back files are required for each submission.
          </p>
        </section>

        <Card className="border border-[var(--surface-border)] bg-white p-6 text-[var(--text)] shadow-sm">
          <h2 className="text-lg font-semibold text-[#173543]">Submission Summary</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(["vape", "flower", "pre_roll", "concentrate"] as PackagingCategory[]).map((category) => {
              const summary = byCategorySummary.get(category) || { pending: 0, approved: 0, rejected: 0 };
              return (
                <div key={category} className="rounded-xl border border-[#dbe9ef] bg-[#f9fcfd] px-4 py-3 text-sm text-[#173543]">
                  <p className="font-semibold">{packagingCategoryLabel(category)}</p>
                  <p className="mt-1 text-xs text-[#5d7685]">Pending: {summary.pending}</p>
                  <p className="text-xs text-[#5d7685]">Approved: {summary.approved}</p>
                  <p className="text-xs text-[#5d7685]">Rejected: {summary.rejected}</p>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="border border-[var(--surface-border)] bg-white p-6 text-[var(--text)] shadow-sm">
          <PackagingUploadClient
            submissions={normalizedSubmissions}
            defaultCategory={defaultCategory}
            returnTo={returnTo}
          />
        </Card>
      </div>
    </AppShell>
  );
}
