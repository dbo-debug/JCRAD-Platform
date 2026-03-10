export type EstimateLine = Record<string, unknown>;

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
