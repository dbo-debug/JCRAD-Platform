export const NAMELESS_WORKSPACE_KEY = "nameless_genetics_retail_sales";
export const NAMELESS_WORKSPACE_NAME = "Nameless Genetics Retail Sales";
export const DEFAULT_COMMISSION_RATE = 0.05;

export const SALES_ZONE_OPTIONS = [
  "San Fernando Valley",
  "Los Angeles",
  "DTLA",
  "West Los Angeles",
  "Mid-City",
  "San Gabriel Valley",
  "Orange County",
  "Inland Empire",
  "San Diego",
  "Northern California",
  "Other",
] as const;

export const ACCOUNT_OWNERSHIP_OPTIONS = [
  "unverified",
  "existing_nameless_account",
  "nameless_house_account",
  "douglas_originated_account",
  "shared_account",
  "not_eligible_for_commission",
] as const;

export const OPPORTUNITY_STAGE_OPTIONS = [
  "new_prospect",
  "researching",
  "contact_attempted",
  "buyer_contacted",
  "meeting_scheduled",
  "meeting_completed",
  "samples_requested",
  "samples_delivered",
  "awaiting_sample_feedback",
  "pricing_sent",
  "order_discussed",
  "order_pending",
  "first_order_placed",
  "active_account",
  "reorder_due",
  "on_hold",
  "lost",
  "not_qualified",
] as const;

export const PRODUCT_INTEREST_OPTIONS = [
  "Flower",
  "Pre-rolls",
  "Infused pre-rolls",
  "Genetics",
  "Clones",
  "Seeds",
  "Concentrates",
  "Rosin",
  "Vapes",
  "Edibles",
  "Other",
] as const;
