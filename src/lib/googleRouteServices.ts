import { createSign } from "node:crypto";

type LatLng = {
  latitude: number;
  longitude: number;
};

type OptimizeStop = {
  stopId: string;
  latitude: number;
  longitude: number;
};

type ComputeRoutesLeg = {
  duration?: string;
  staticDuration?: string;
  distanceMeters?: number;
};

type ComputeRoutesResponse = {
  routes?: Array<{
    duration?: string;
    distanceMeters?: number;
    polyline?: {
      encodedPolyline?: string;
    };
    legs?: ComputeRoutesLeg[];
  }>;
};

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function getGoogleRoutesApiKey() {
  return asText(process.env.GOOGLE_ROUTES_API_KEY) || asText(process.env.GOOGLE_MAPS_SERVER_API_KEY);
}

function parseDurationToSeconds(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return 0;
  const match = text.match(/^(-?\d+(?:\.\d+)?)s$/);
  if (!match) return 0;
  return Math.max(0, Math.round(Number(match[1])));
}

function base64UrlEncode(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function getGoogleOAuthAccessToken() {
  const clientEmail = asText(process.env.GOOGLE_ROUTE_OPTIMIZATION_CLIENT_EMAIL);
  const privateKey = asText(process.env.GOOGLE_ROUTE_OPTIMIZATION_PRIVATE_KEY)?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const unsignedJwt = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claimSet))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedJwt);
  signer.end();
  const signature = signer.sign(privateKey);
  const assertion = `${unsignedJwt}.${base64UrlEncode(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Google OAuth token request failed (${res.status})`);
  }

  const json = (await res.json()) as { access_token?: string };
  const accessToken = asText(json.access_token);
  if (!accessToken) throw new Error("Google OAuth token response did not include an access token");
  return accessToken;
}

function toWaypoint(latLng: LatLng) {
  return {
    location: {
      latLng,
    },
  };
}

export function canUseGoogleRoutesApi() {
  return Boolean(getGoogleRoutesApiKey());
}

export function canUseGoogleRouteOptimization() {
  return Boolean(
    asText(process.env.GOOGLE_ROUTE_OPTIMIZATION_PROJECT_ID) &&
      asText(process.env.GOOGLE_ROUTE_OPTIMIZATION_CLIENT_EMAIL) &&
      asText(process.env.GOOGLE_ROUTE_OPTIMIZATION_PRIVATE_KEY)
  );
}

export function canUseGoogleRouteServices() {
  return canUseGoogleRoutesApi();
}

export async function optimizeStopOrderWithGoogle(args: {
  origin: LatLng;
  destination?: LatLng;
  stops: OptimizeStop[];
  routeDateTimeIso: string;
  serviceDurationMinutes?: number;
}) {
  const projectId = asText(process.env.GOOGLE_ROUTE_OPTIMIZATION_PROJECT_ID);
  if (!projectId) throw new Error("Missing GOOGLE_ROUTE_OPTIMIZATION_PROJECT_ID");
  if (args.stops.length === 0) return { orderedStopIds: [] as string[], provider: "google-route-optimization" };
  if (args.stops.length === 1) return { orderedStopIds: [args.stops[0].stopId], provider: "google-route-optimization" };

  const accessToken = await getGoogleOAuthAccessToken();
  if (!accessToken) throw new Error("Google Route Optimization OAuth credentials are not configured");

  const res = await fetch(`https://routeoptimization.googleapis.com/v1/projects/${projectId}:optimizeTours`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      timeout: "10s",
      model: {
        globalStartTime: args.routeDateTimeIso,
        globalEndTime: new Date(new Date(args.routeDateTimeIso).getTime() + 14 * 60 * 60 * 1000).toISOString(),
        shipments: args.stops.map((stop) => ({
          label: stop.stopId,
          deliveries: [
            {
              arrivalLocation: {
                latitude: stop.latitude,
                longitude: stop.longitude,
              },
              duration: `${Math.max(0, Math.round(args.serviceDurationMinutes || 30)) * 60}s`,
            },
          ],
        })),
        vehicles: [
          {
            label: "jc-rad-daily-route",
            startLocation: args.origin,
            endLocation: args.destination || args.origin,
            costPerHour: 1,
          },
        ],
      },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Route Optimization API failed (${res.status})`);
  }

  const json = (await res.json()) as {
    routes?: Array<{
      visits?: Array<{
        shipmentLabel?: string;
        isPickup?: boolean;
      }>;
    }>;
  };
  const orderedStopIds =
    json.routes?.[0]?.visits
      ?.filter((visit) => visit.isPickup !== true)
      .map((visit) => asText(visit.shipmentLabel))
      .filter((value): value is string => Boolean(value)) || [];

  return {
    orderedStopIds,
    provider: "google-route-optimization",
  };
}

export async function computeGoogleRouteSchedule(args: {
  origin: LatLng;
  orderedStops: Array<{ latitude: number; longitude: number }>;
}) {
  const apiKey = getGoogleRoutesApiKey();
  if (!apiKey) throw new Error("Missing GOOGLE_ROUTES_API_KEY or GOOGLE_MAPS_SERVER_API_KEY");

  const waypoints = args.orderedStops.map((stop) =>
    toWaypoint({
      latitude: stop.latitude,
      longitude: stop.longitude,
    })
  );

  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.duration,routes.legs.staticDuration,routes.legs.distanceMeters",
    },
    body: JSON.stringify({
      origin: toWaypoint(args.origin),
      destination: toWaypoint(args.origin),
      intermediates: waypoints,
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      computeAlternativeRoutes: false,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Routes API failed (${res.status})`);
  }

  const json = (await res.json()) as ComputeRoutesResponse;
  const route = json.routes?.[0];
  if (!route) throw new Error("Routes API did not return a route");

  return {
    totalDurationSeconds: parseDurationToSeconds(route.duration),
    totalDistanceMeters: Number(route.distanceMeters || 0),
    polyline: asText(route.polyline?.encodedPolyline),
    legs:
      route.legs?.map((leg) => ({
        durationSeconds: parseDurationToSeconds(leg.duration),
        staticDurationSeconds: parseDurationToSeconds(leg.staticDuration),
        distanceMeters: Number(leg.distanceMeters || 0),
      })) || [],
    provider: "google-routes",
  };
}
