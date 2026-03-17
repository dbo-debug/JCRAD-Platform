import { buildNormalizedAddress, geocodeAddress, type GeocodeInput, type GeocodeResult } from "@/lib/geocode";

type CustomerGeoRow = {
  address_1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export function getCustomerGeocodeInput(row: CustomerGeoRow): GeocodeInput {
  return {
    address1: row.address_1,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
  };
}

export function getCustomerNormalizedAddress(row: CustomerGeoRow) {
  return buildNormalizedAddress(getCustomerGeocodeInput(row));
}

export async function geocodeCustomerRow(row: CustomerGeoRow): Promise<GeocodeResult> {
  return geocodeAddress(getCustomerGeocodeInput(row));
}
