export type GeocodeStatus = "geocoded" | "missing_address" | "failed" | "needs_review";
export type GeocodeFailureReason =
  | "unsupported_provider"
  | "transport_failed"
  | "no_match"
  | "multiple_matches"
  | "invalid_coordinates"
  | "unknown";

export type GeocodeInput = {
  address1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
};

export type GeocodeResult = {
  ok: boolean;
  status: GeocodeStatus;
  latitude: number | null;
  longitude: number | null;
  normalizedAddress: string | null;
  provider: string | null;
  errorMessage?: string;
};

type NominatimRow = {
  lat?: string;
  lon?: string;
};

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function classifyGeocodeFailure(result: Pick<GeocodeResult, "status" | "errorMessage">): GeocodeFailureReason | null {
  if (result.status === "geocoded" || result.status === "missing_address") return null;

  const message = String(result.errorMessage || "").trim().toLowerCase();
  if (message.includes("unsupported geocode provider")) return "unsupported_provider";
  if (message.includes("multiple geocode matches")) return "multiple_matches";
  if (message.includes("no geocode match")) return "no_match";
  if (message.includes("invalid coordinates")) return "invalid_coordinates";
  if (message.includes("geocoder returned") || message.includes("request failed")) return "transport_failed";
  return "unknown";
}

export function buildNormalizedAddress(input: GeocodeInput) {
  const parts = [input.address1, input.city, input.state, input.postalCode]
    .map((value) => asText(value))
    .filter((value): value is string => Boolean(value))
    .map((value) => collapseWhitespace(value));

  return parts.length > 0 ? parts.join(", ") : null;
}

export function hasSufficientAddress(input: GeocodeInput) {
  return Boolean(asText(input.address1) && asText(input.city) && (asText(input.state) || asText(input.postalCode)));
}

async function geocodeWithNominatim(input: GeocodeInput, normalizedAddress: string): Promise<GeocodeResult> {
  const baseUrl = String(process.env.GEOCODE_NOMINATIM_BASE_URL || "https://nominatim.openstreetmap.org").replace(/\/+$/, "");
  const email = asText(process.env.GEOCODE_NOMINATIM_EMAIL);
  const userAgent = String(process.env.GEOCODE_USER_AGENT || "jcrad-platform-geocoder/1.0");
  const url = new URL("/search", baseUrl);

  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "2");
  url.searchParams.set("q", normalizedAddress);
  if (email) url.searchParams.set("email", email);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": userAgent,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return {
        ok: false,
        status: "failed",
        latitude: null,
        longitude: null,
        normalizedAddress,
        provider: "nominatim",
        errorMessage: `Geocoder returned ${res.status}`,
      };
    }

    const rows = (await res.json().catch(() => [])) as NominatimRow[];
    if (!Array.isArray(rows) || rows.length === 0) {
      return {
        ok: false,
        status: "needs_review",
        latitude: null,
        longitude: null,
        normalizedAddress,
        provider: "nominatim",
        errorMessage: "No geocode match returned",
      };
    }
    if (rows.length > 1) {
      return {
        ok: false,
        status: "needs_review",
        latitude: null,
        longitude: null,
        normalizedAddress,
        provider: "nominatim",
        errorMessage: "Multiple geocode matches returned",
      };
    }

    const latitude = Number(rows[0]?.lat);
    const longitude = Number(rows[0]?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return {
        ok: false,
        status: "needs_review",
        latitude: null,
        longitude: null,
        normalizedAddress,
        provider: "nominatim",
        errorMessage: "Geocoder returned invalid coordinates",
      };
    }

    return {
      ok: true,
      status: "geocoded",
      latitude,
      longitude,
      normalizedAddress,
      provider: "nominatim",
    };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      latitude: null,
      longitude: null,
      normalizedAddress,
      provider: "nominatim",
      errorMessage: error instanceof Error ? error.message : "Geocode request failed",
    };
  }
}

export async function geocodeAddress(input: GeocodeInput): Promise<GeocodeResult> {
  const normalizedAddress = buildNormalizedAddress(input);
  if (!hasSufficientAddress(input) || !normalizedAddress) {
    return {
      ok: false,
      status: "missing_address",
      latitude: null,
      longitude: null,
      normalizedAddress,
      provider: null,
    };
  }

  const configuredProvider = asText(process.env.GEOCODE_PROVIDER)?.toLowerCase() || "nominatim";
  if (configuredProvider !== "nominatim") {
    return {
      ok: false,
      status: "needs_review",
      latitude: null,
      longitude: null,
      normalizedAddress,
      provider: configuredProvider,
      errorMessage: `Unsupported geocode provider: ${configuredProvider}`,
    };
  }

  return geocodeWithNominatim(input, normalizedAddress);
}
