type PackagingSubmissionRow = {
  category: string | null;
  status: string | null;
};

type EstimateLinePackagingRow = {
  id: string;
  offer_id: string | null;
  packaging_mode: string | null;
  pre_roll_mode: string | null;
};

type OfferCategoryRow = {
  id: string;
  products: {
    category: string | null;
  } | null;
};

export type EstimatePackagingReviewState = {
  hasCustomerPackaging: boolean;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  missingSubmissionCount: number;
  hasUnapprovedCustomerPackaging: boolean;
};

function normalizeStatus(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function normalizeCategory(value: unknown): string {
  return String(value || "").trim().toLowerCase().replace("-", "_");
}

export async function getEstimatePackagingReviewState(
  supabase: any,
  estimateId: string,
): Promise<EstimatePackagingReviewState> {
  const state: EstimatePackagingReviewState = {
    hasCustomerPackaging: false,
    approvedCount: 0,
    pendingCount: 0,
    rejectedCount: 0,
    missingSubmissionCount: 0,
    hasUnapprovedCustomerPackaging: false,
  };

  const normalizedEstimateId = String(estimateId || "").trim();
  if (!normalizedEstimateId) return state;

  const { data: estimateRow, error: estimateErr } = await supabase
    .from("estimates")
    .select("customer_email")
    .eq("id", normalizedEstimateId)
    .single();
  if (estimateErr) throw new Error(estimateErr.message);

  const customerEmail = String((estimateRow as any)?.customer_email || "").trim().toLowerCase();

  const { data: rawLines, error: linesErr } = await supabase
    .from("estimate_lines")
    .select("id, offer_id, packaging_mode, pre_roll_mode")
    .eq("estimate_id", normalizedEstimateId);
  if (linesErr) throw new Error(linesErr.message);

  const lines = (rawLines || []) as EstimateLinePackagingRow[];
  const customerLines = lines.filter((line) => normalizeStatus(line.packaging_mode) === "customer");
  if (customerLines.length === 0) return state;

  state.hasCustomerPackaging = true;
  if (!customerEmail) {
    state.missingSubmissionCount = customerLines.length;
    state.hasUnapprovedCustomerPackaging = true;
    return state;
  }
  const offerIds = Array.from(new Set(customerLines.map((line) => String(line.offer_id || "").trim()).filter(Boolean)));
  const categoryByOfferId = new Map<string, string>();
  if (offerIds.length > 0) {
    const { data: rawOffers, error: offerErr } = await supabase
      .from("offers")
      .select("id, products:product_id(category)")
      .in("id", offerIds);
    if (offerErr) throw new Error(offerErr.message);

    for (const row of (rawOffers || []) as OfferCategoryRow[]) {
      categoryByOfferId.set(String(row.id || ""), normalizeCategory(row.products?.category));
    }
  }

  const requiredCategories = new Set<string>();
  for (const line of customerLines) {
    if (String(line.pre_roll_mode || "").trim()) {
      requiredCategories.add("pre_roll");
      continue;
    }
    const offerId = String(line.offer_id || "").trim();
    if (!offerId) continue;
    const category = categoryByOfferId.get(offerId) || "";
    if (category) requiredCategories.add(category);
  }

  const statusesByCategory = new Map<string, Set<string>>();
  if (requiredCategories.size > 0) {
    const { data: rawSubmissions, error: submissionsErr } = await supabase
      .from("packaging_submissions")
      .select("category, status")
      .eq("customer_email", customerEmail)
      .in("category", Array.from(requiredCategories));
    if (submissionsErr) throw new Error(submissionsErr.message);

    for (const row of (rawSubmissions || []) as PackagingSubmissionRow[]) {
      const category = normalizeCategory(row.category);
      if (!category) continue;
      const statuses = statusesByCategory.get(category) || new Set<string>();
      statuses.add(normalizeStatus(row.status));
      statusesByCategory.set(category, statuses);
    }
  }

  for (const line of customerLines) {
    const lineCategory = String(line.pre_roll_mode || "").trim()
      ? "pre_roll"
      : categoryByOfferId.get(String(line.offer_id || "").trim()) || "";
    if (!lineCategory) {
      state.missingSubmissionCount += 1;
      continue;
    }
    const statuses = statusesByCategory.get(lineCategory);
    if (!statuses || statuses.size === 0) {
      state.missingSubmissionCount += 1;
      continue;
    }
    if (statuses.has("approved")) {
      state.approvedCount += 1;
      continue;
    }
    if (statuses.has("pending")) {
      state.pendingCount += 1;
      continue;
    }
    if (statuses.has("rejected")) {
      state.rejectedCount += 1;
      continue;
    }
    state.pendingCount += 1;
  }

  state.hasUnapprovedCustomerPackaging =
    state.missingSubmissionCount > 0 || state.pendingCount > 0 || state.rejectedCount > 0;
  return state;
}
