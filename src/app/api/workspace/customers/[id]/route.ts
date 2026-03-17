import { NextResponse } from "next/server";
import { geocodeCustomerRow, getCustomerNormalizedAddress } from "@/lib/customerGeocode";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffContext } from "@/lib/getStaffContext";

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function asTimestamp(value: unknown): string | null {
  const text = asText(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function asRouteDay(value: unknown): string | null {
  const text = asText(value);
  if (!text) return null;
  const normalized = text.toLowerCase();
  const allowedDays = new Set(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
  if (!allowedDays.has(normalized)) return null;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function isAllowedStatus(value: string | null): boolean {
  if (!value) return true;
  return new Set(["active", "prospect", "lead", "on_hold", "inactive"]).has(value);
}

function isAllowedStage(value: string | null): boolean {
  if (!value) return true;
  return new Set(["new", "qualified", "active", "paused", "closed"]).has(value);
}

function isAllowedVisitStatus(value: string | null): boolean {
  if (!value) return true;
  return new Set(["due", "scheduled", "visited", "overdue", "skipped", "needs_follow_up", "met_buyer", "no_answer", "unavailable", "sample_drop", "interested", "revisit_needed"]).has(value);
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));
  const applyRoute = body.apply_route === true || body.apply_route === "true";

  const companyName = asText(body.company_name);
  const primaryContactEmail = asText(body.primary_contact_email);
  const status = asText(body.status);
  const stage = asText(body.stage);
  const address1 = asText(body.address_1);
  const address2 = asText(body.address_2);
  const city = asText(body.city);
  const state = asText(body.state);
  const postalCode = asText(body.postal_code);
  const forceGeocode = body.force_geocode === true || body.force_geocode === "true";
  const assignedSalesUserId = asText(body.assigned_sales_user_id);
  const territoryCode = asText(body.territory_code);
  const routeDay = asRouteDay(body.route_day);
  const assignedRouteRepUserId = asText(body.assigned_route_rep_user_id);
  const routePriority = asNullableNumber(body.route_priority);
  const visitStatus = asText(body.visit_status);
  const lastVisitAt = asTimestamp(body.last_visit_at);
  const nextVisitDueAt = asTimestamp(body.next_visit_due_at);
  const latitude = asNullableNumber(body.latitude);
  const longitude = asNullableNumber(body.longitude);

  if (!isAllowedStatus(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (!isAllowedStage(stage)) {
    return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
  }
  if ("route_day" in body && body.route_day && !routeDay) {
    return NextResponse.json({ error: "Invalid route_day" }, { status: 400 });
  }
  if (!isAllowedVisitStatus(visitStatus)) {
    return NextResponse.json({ error: "Invalid visit_status" }, { status: 400 });
  }
  if ("last_visit_at" in body && body.last_visit_at && !lastVisitAt) {
    return NextResponse.json({ error: "Invalid last_visit_at" }, { status: 400 });
  }
  if ("next_visit_due_at" in body && body.next_visit_due_at && !nextVisitDueAt) {
    return NextResponse.json({ error: "Invalid next_visit_due_at" }, { status: 400 });
  }
  if ("route_priority" in body && body.route_priority !== null && body.route_priority !== "" && routePriority === null) {
    return NextResponse.json({ error: "Invalid route_priority" }, { status: 400 });
  }
  if (routePriority !== null && (routePriority < 1 || routePriority > 5 || !Number.isInteger(routePriority))) {
    return NextResponse.json({ error: "route_priority must be an integer from 1 to 5" }, { status: 400 });
  }
  if ("latitude" in body && body.latitude !== null && body.latitude !== "" && latitude === null) {
    return NextResponse.json({ error: "Invalid latitude" }, { status: 400 });
  }
  if ("longitude" in body && body.longitude !== null && body.longitude !== "" && longitude === null) {
    return NextResponse.json({ error: "Invalid longitude" }, { status: 400 });
  }
  if (latitude !== null && (latitude < -90 || latitude > 90)) {
    return NextResponse.json({ error: "latitude must be between -90 and 90" }, { status: 400 });
  }
  if (longitude !== null && (longitude < -180 || longitude > 180)) {
    return NextResponse.json({ error: "longitude must be between -180 and 180" }, { status: 400 });
  }
  if (applyRoute && (!territoryCode || !routeDay || !assignedRouteRepUserId)) {
    return NextResponse.json({ error: "Applying a route requires territory_code, route_day, and assigned_route_rep_user_id" }, { status: 400 });
  }

  const payload: Record<string, string | number | null> = {};

  if ("status" in body) payload.status = status;
  if ("stage" in body) payload.stage = stage;
  if ("primary_contact_email" in body) payload.primary_contact_email = primaryContactEmail;
  if ("address_1" in body) payload.address_1 = address1;
  if ("address_2" in body) payload.address_2 = address2;
  if ("city" in body) payload.city = city;
  if ("state" in body) payload.state = state;
  if ("postal_code" in body) payload.postal_code = postalCode;
  if ("territory_code" in body) payload.territory_code = territoryCode;
  if ("route_day" in body) payload.route_day = routeDay;
  if ("route_priority" in body) payload.route_priority = routePriority;
  if ("visit_status" in body) payload.visit_status = visitStatus;
  if ("last_visit_at" in body) payload.last_visit_at = lastVisitAt;
  if ("next_visit_due_at" in body) payload.next_visit_due_at = nextVisitDueAt;
  if ("latitude" in body) payload.latitude = latitude;
  if ("longitude" in body) payload.longitude = longitude;

  if (staff.role === "admin") {
    if ("company_name" in body) payload.company_name = companyName;
    if ("assigned_sales_user_id" in body) payload.assigned_sales_user_id = assignedSalesUserId;
    if ("assigned_route_rep_user_id" in body) payload.assigned_route_rep_user_id = assignedRouteRepUserId;
  } else {
    const isOwnRouteAssignment = applyRoute && "assigned_route_rep_user_id" in body && assignedRouteRepUserId === staff.userId;
    if ("company_name" in body || "assigned_sales_user_id" in body || ("assigned_route_rep_user_id" in body && !isOwnRouteAssignment)) {
      return NextResponse.json({ error: "Only admins can update company or assignment fields" }, { status: 403 });
    }
    if (isOwnRouteAssignment) {
      payload.assigned_route_rep_user_id = assignedRouteRepUserId;
    }
  }

  const supabase = createAdminClient();
  const { data: currentCustomer, error: customerError } = await supabase
    .from("customers")
    .select(
      "id, address_1, address_2, city, state, postal_code, latitude, longitude, geocode_status, geocoded_address, geocode_provider, last_geocoded_at, geocode_source, geocoded_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (customerError) {
    return NextResponse.json({ error: customerError.message }, { status: 500 });
  }
  if (!currentCustomer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  if (territoryCode) {
    const { data: territory, error: territoryError } = await supabase.from("territories").select("code").eq("code", territoryCode).maybeSingle();
    if (territoryError) {
      return NextResponse.json({ error: territoryError.message }, { status: 500 });
    }
    if (!territory) {
      return NextResponse.json({ error: "Unknown territory_code" }, { status: 400 });
    }
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const nextCustomerRow = {
    address_1: "address_1" in body ? address1 : asText(currentCustomer.address_1),
    address_2: "address_2" in body ? address2 : asText(currentCustomer.address_2),
    city: "city" in body ? city : asText(currentCustomer.city),
    state: "state" in body ? state : asText(currentCustomer.state),
    postal_code: "postal_code" in body ? postalCode : asText(currentCustomer.postal_code),
    latitude: "latitude" in body ? latitude : asNullableNumber(currentCustomer.latitude),
    longitude: "longitude" in body ? longitude : asNullableNumber(currentCustomer.longitude),
  };
  const addressFieldsTouched = "address_1" in body || "address_2" in body || "city" in body || "state" in body || "postal_code" in body;
  const normalizedPreviousAddress = getCustomerNormalizedAddress({
    address_1: asText(currentCustomer.address_1),
    city: asText(currentCustomer.city),
    state: asText(currentCustomer.state),
    postal_code: asText(currentCustomer.postal_code),
  });
  const normalizedNextAddress = getCustomerNormalizedAddress(nextCustomerRow);
  const shouldAttemptGeocode = forceGeocode || (addressFieldsTouched && normalizedPreviousAddress !== normalizedNextAddress);

  if (shouldAttemptGeocode) {
    const geocode = await geocodeCustomerRow(nextCustomerRow);
    payload.geocode_status = geocode.status;
    payload.geocoded_address = geocode.normalizedAddress;
    payload.geocode_provider = geocode.provider;
    payload.geocode_source = geocode.provider;
    payload.last_geocoded_at = geocode.status === "missing_address" ? null : new Date().toISOString();
    payload.geocoded_at = geocode.status === "missing_address" ? null : new Date().toISOString();

    if (geocode.ok) {
      payload.latitude = geocode.latitude;
      payload.longitude = geocode.longitude;
    } else if (geocode.status === "missing_address" || normalizedPreviousAddress !== normalizedNextAddress || forceGeocode) {
      payload.latitude = null;
      payload.longitude = null;
    }
  }

  const { error } = await supabase.from("customers").update(payload).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    geocoded: shouldAttemptGeocode,
    latitude: payload.latitude ?? nextCustomerRow.latitude ?? null,
    longitude: payload.longitude ?? nextCustomerRow.longitude ?? null,
    geocode_status: payload.geocode_status ?? asText(currentCustomer.geocode_status),
    geocoded_address: payload.geocoded_address ?? asText(currentCustomer.geocoded_address),
    geocode_provider: payload.geocode_provider ?? asText(currentCustomer.geocode_provider || currentCustomer.geocode_source),
    last_geocoded_at: payload.last_geocoded_at ?? asText(currentCustomer.last_geocoded_at || currentCustomer.geocoded_at),
  });
}
