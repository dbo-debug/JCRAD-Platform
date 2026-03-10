export type EstimateLineOfferProduct = {
  id?: string | null;
  name?: string | null;
  category?: string | null;
  type?: string | null;
};

export type EstimateLineOffer = {
  id?: string | null;
  product_id?: string | null;
  products?: EstimateLineOfferProduct | null;
};

export type EstimateLineInfusionInputs = {
  internal?: {
    product_name?: string | null;
  } | null;
  external?: {
    liquid_product_name?: string | null;
    dry_product_name?: string | null;
  } | null;
};

export type EstimateLine = Record<string, unknown> & {
  offers?: EstimateLineOffer | null;
  infusion_inputs?: EstimateLineInfusionInputs | null;
};

export type EstimatePayload = {
  id?: string;
  subtotal?: number;
  adjustments?: number;
  total?: number;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  created_at?: string | null;
  packaging_review_pending?: boolean;
};

export type BreakdownRow = {
  id: string;
  label: string;
  total: number;
};

export type BreakdownGroupData = {
  id: string;
  title: string;
  rows: BreakdownRow[];
  subtotal: number;
};
