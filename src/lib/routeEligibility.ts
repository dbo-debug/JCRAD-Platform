import type { CustomerSummary } from "@/lib/customerWorkspace";

export type RouteEligibilityReason =
  | "missing_address"
  | "missing_coordinates"
  | "invalid_coordinates"
  | "geocode_needs_attention"
  | null;

export function customerHasRouteAddress(customer: Pick<CustomerSummary, "address1" | "city" | "state" | "postalCode">) {
  return Boolean(customer.address1 || customer.city || customer.state || customer.postalCode);
}

export function customerHasValidRouteCoordinates(customer: Pick<CustomerSummary, "latitude" | "longitude">) {
  if (customer.latitude === null || customer.longitude === null) return false;
  return Number.isFinite(customer.latitude) && Number.isFinite(customer.longitude) && Math.abs(customer.latitude) <= 90 && Math.abs(customer.longitude) <= 180;
}

export function getRouteEligibilityReason(
  customer: Pick<CustomerSummary, "address1" | "city" | "state" | "postalCode" | "latitude" | "longitude" | "geocodeStatus">
): RouteEligibilityReason {
  if (!customerHasRouteAddress(customer) || customer.geocodeStatus === "missing_address") return "missing_address";
  if (customer.latitude === null || customer.longitude === null) return "missing_coordinates";
  if (!customerHasValidRouteCoordinates(customer)) return "invalid_coordinates";
  if (customer.geocodeStatus === "failed" || customer.geocodeStatus === "needs_review") return "geocode_needs_attention";
  return null;
}

export function isRouteEligibleCustomer(
  customer: Pick<CustomerSummary, "address1" | "city" | "state" | "postalCode" | "latitude" | "longitude" | "geocodeStatus">
) {
  return getRouteEligibilityReason(customer) === null;
}
