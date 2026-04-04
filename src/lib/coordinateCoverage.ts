import type { CustomerSummary } from "@/lib/customerWorkspace";

export type CoordinateCoverageState = "has_coords" | "address_ready" | "missing_address" | "failed" | "needs_review";

export function customerHasAddress(customer: Pick<CustomerSummary, "address1" | "city" | "state" | "postalCode">) {
  return Boolean(customer.address1 || customer.city || customer.state || customer.postalCode);
}

export function getCoordinateCoverageState(customer: Pick<CustomerSummary, "address1" | "city" | "state" | "postalCode" | "latitude" | "longitude" | "geocodeStatus">) {
  if (customer.latitude !== null && customer.longitude !== null) return "has_coords" satisfies CoordinateCoverageState;
  if (customer.geocodeStatus === "failed") return "failed" satisfies CoordinateCoverageState;
  if (customer.geocodeStatus === "needs_review") return "needs_review" satisfies CoordinateCoverageState;
  return customerHasAddress(customer) ? "address_ready" : "missing_address";
}
