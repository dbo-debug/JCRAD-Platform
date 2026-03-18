import { NextResponse } from "next/server";
import { logPlatformEvent } from "@/lib/events/logPlatformEvent";
import { getStaffContext } from "@/lib/getStaffContext";
import { buildHallOfFlowersSmsBody, normalizePhoneNumber, sendSms, type SmsSendResult } from "@/lib/sms";
import { createAdminClient } from "@/lib/supabase/admin";

type CustomerRow = {
  id: string;
  company_name: string | null;
  primary_contact_email: string | null;
  main_phone: string | null;
  city: string | null;
  source: string | null;
  import_notes: string | null;
  assigned_sales_user_id: string | null;
};

type ContactRow = {
  id: string;
  customer_id: string;
  is_primary: boolean | null;
};

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function asEmail(value: unknown): string | null {
  const email = asText(value)?.toLowerCase() || null;
  if (!email) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function asBool(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeName(value: string | null): string | null {
  const text = asText(value)?.toLowerCase() || null;
  return text ? text.replace(/\s+/g, " ") : null;
}

function appendImportNote(existing: string | null, note: string) {
  const trimmedExisting = asText(existing);
  if (!trimmedExisting) return note;
  if (trimmedExisting.includes(note)) return trimmedExisting;
  return `${trimmedExisting}\n${note}`;
}

async function resolveOwnerId(args: {
  requestedOwnerId: string | null;
  staffUserId: string;
  staffRole: "admin" | "sales";
}) {
  if (args.staffRole !== "admin") return args.staffUserId;

  const requestedOwnerId = asText(args.requestedOwnerId);
  if (!requestedOwnerId) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("profiles").select("id, role").eq("id", requestedOwnerId).maybeSingle();
  if (error) throw new Error(error.message);
  const role = String(data?.role || "").trim().toLowerCase();
  return role === "admin" || role === "sales" ? String(data?.id || "") : null;
}

async function findExistingCustomer(args: {
  companyName: string;
  email: string | null;
  mobilePhone: string;
}) {
  const supabase = createAdminClient();
  const matchIds = new Set<string>();

  if (args.email) {
    const [contactRes, customerRes] = await Promise.all([
      supabase.from("customer_contacts").select("customer_id").ilike("email", args.email),
      supabase.from("customers").select("id").ilike("primary_contact_email", args.email),
    ]);
    if (contactRes.error) throw new Error(contactRes.error.message);
    if (customerRes.error) throw new Error(customerRes.error.message);
    for (const row of contactRes.data || []) {
      const customerId = String(row.customer_id || "").trim();
      if (customerId) matchIds.add(customerId);
    }
    for (const row of customerRes.data || []) {
      const customerId = String(row.id || "").trim();
      if (customerId) matchIds.add(customerId);
    }
  }

  const phoneCandidates = [asText(args.mobilePhone), normalizePhoneNumber(args.mobilePhone)].filter(Boolean) as string[];
  for (const phone of phoneCandidates) {
    const [contactRes, customerRes] = await Promise.all([
      supabase.from("customer_contacts").select("customer_id").eq("phone", phone),
      supabase.from("customers").select("id").eq("main_phone", phone),
    ]);
    if (contactRes.error) throw new Error(contactRes.error.message);
    if (customerRes.error) throw new Error(customerRes.error.message);
    for (const row of contactRes.data || []) {
      const customerId = String(row.customer_id || "").trim();
      if (customerId) matchIds.add(customerId);
    }
    for (const row of customerRes.data || []) {
      const customerId = String(row.id || "").trim();
      if (customerId) matchIds.add(customerId);
    }
  }

  const normalizedCompanyName = normalizeName(args.companyName);
  if (normalizedCompanyName) {
    const { data, error } = await supabase.from("customers").select("id, company_name").ilike("company_name", args.companyName);
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      if (normalizeName(asText(row.company_name)) === normalizedCompanyName) {
        const customerId = String(row.id || "").trim();
        if (customerId) matchIds.add(customerId);
      }
    }
  }

  if (matchIds.size !== 1) return null;
  const customerId = [...matchIds][0];
  const { data, error } = await supabase
    .from("customers")
    .select("id, company_name, primary_contact_email, main_phone, city, source, import_notes, assigned_sales_user_id")
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CustomerRow | null) || null;
}

async function upsertPrimaryContact(args: {
  customerId: string;
  contactName: string | null;
  email: string | null;
  phone: string;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("customer_contacts")
    .select("id, customer_id, is_primary, email")
    .eq("customer_id", args.customerId);

  if (error) throw new Error(error.message);

  const rows = (data || []) as Array<ContactRow & { email?: string | null }>;
  const emailMatch = args.email
    ? rows.find((row) => String(row.email || "").trim().toLowerCase() === args.email)
    : null;
  const primary = rows.find((row) => row.is_primary);
  const target = emailMatch || primary || null;
  const shouldBePrimary = !primary || Boolean(target?.is_primary);
  const payload = {
    customer_id: args.customerId,
    name: args.contactName,
    email: args.email,
    phone: args.phone,
    title: "Hall of Flowers lead",
    is_primary: shouldBePrimary,
    source: "hall_of_flowers",
    import_notes: "Captured from Hall of Flowers quick-add.",
  };

  if (target?.id) {
    const { error: updateError } = await supabase.from("customer_contacts").update(payload).eq("id", target.id);
    if (updateError) throw new Error(updateError.message);
    return;
  }

  const { error: insertError } = await supabase.from("customer_contacts").insert(payload);
  if (insertError) throw new Error(insertError.message);
}

function smsStatusLabel(status: SmsSendResult["status"]) {
  if (status === "sent") return "sent";
  if (status === "not_configured") return "not configured";
  if (status === "invalid_number") return "invalid number";
  return "failed";
}

export async function POST(req: Request) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const companyName = asText(body.account_name);
  const contactName = asText(body.contact_name);
  const mobilePhone = asText(body.mobile_phone);
  const email = body.email === "" ? null : asEmail(body.email);
  const city = asText(body.city);
  const notes = asText(body.notes);
  const interest = asText(body.interest);
  const source = asText(body.source) || "hall_of_flowers";
  const hotLead = asBool(body.hot_lead);

  if (!companyName) {
    return NextResponse.json({ error: "Account/store name is required." }, { status: 400 });
  }
  if (!mobilePhone) {
    return NextResponse.json({ error: "Mobile phone is required." }, { status: 400 });
  }
  if ("email" in body && body.email && !email) {
    return NextResponse.json({ error: "Email is invalid." }, { status: 400 });
  }

  try {
    const assignedSalesUserId = await resolveOwnerId({
      requestedOwnerId: asText(body.owner_user_id),
      staffUserId: staff.userId,
      staffRole: staff.role,
    });
    const supabase = createAdminClient();
    const matchedCustomer = await findExistingCustomer({ companyName, email, mobilePhone });
    const importNote = `Captured from Hall of Flowers quick-add on ${new Date().toLocaleDateString("en-US")}.`;

    let customerId = matchedCustomer?.id || null;
    const action: "created" | "updated" = matchedCustomer ? "updated" : "created";

    if (matchedCustomer) {
      const updatePayload: Record<string, string | null> = {
        company_name: matchedCustomer.company_name || companyName,
        primary_contact_email: matchedCustomer.primary_contact_email || email,
        main_phone: matchedCustomer.main_phone || mobilePhone,
        city: matchedCustomer.city || city,
        source,
        import_source: "event_quick_add",
        import_notes: appendImportNote(matchedCustomer.import_notes, importNote),
        last_imported_at: new Date().toISOString(),
      };
      if (!matchedCustomer.assigned_sales_user_id && assignedSalesUserId) {
        updatePayload.assigned_sales_user_id = assignedSalesUserId;
      }

      const { error } = await supabase.from("customers").update(updatePayload).eq("id", matchedCustomer.id);
      if (error) throw new Error(error.message);
      customerId = matchedCustomer.id;
    } else {
      const { data, error } = await supabase
        .from("customers")
        .insert({
          company_name: companyName,
          primary_contact_email: email,
          main_phone: mobilePhone,
          city,
          source,
          status: "lead",
          stage: "new",
          assigned_sales_user_id: assignedSalesUserId,
          import_source: "event_quick_add",
          import_notes: appendImportNote(notes, importNote),
          last_imported_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      customerId = String(data?.id || "").trim();
    }

    if (!customerId) throw new Error("Customer record could not be created.");

    await upsertPrimaryContact({
      customerId,
      contactName,
      email,
      phone: mobilePhone,
    });

    if (notes) {
      await supabase.from("customer_notes").insert({
        customer_id: customerId,
        note: notes,
        author_user_id: staff.userId,
      });
    }

    const summaryPrefix = action === "created" ? "Quick event lead created" : "Quick event lead updated";
    await supabase.from("customer_activity").insert({
      customer_id: customerId,
      activity_type: "event_quick_add",
      summary: `${summaryPrefix} from Hall of Flowers`,
      details: {
        source,
        interest,
        hot_lead: hotLead,
        city,
        notes,
        contact_name: contactName,
        contact_email: email,
        mobile_phone: mobilePhone,
      },
      actor_user_id: staff.userId,
    });

    if (hotLead) {
      const { data: taskRow, error: taskError } = await supabase
        .from("customer_tasks")
        .insert({
          customer_id: customerId,
          title: "Follow up with Hall of Flowers lead",
          assigned_user_id: assignedSalesUserId || staff.userId,
          priority: 1,
        })
        .select("id")
        .single();

      if (!taskError) {
        await supabase.from("customer_activity").insert({
          customer_id: customerId,
          activity_type: "task_created",
          summary: "Created task: Follow up with Hall of Flowers lead",
          details: { task_id: taskRow?.id || null, source, auto_created: true },
          actor_user_id: staff.userId,
        });
      }
    }

    const smsResult = await sendSms({
      to: mobilePhone,
      body: buildHallOfFlowersSmsBody(),
    });

    await supabase.from("customer_activity").insert({
      customer_id: customerId,
      activity_type: smsResult.ok ? "sms_sent" : "sms_failed",
      summary: smsResult.ok ? "Sent Hall of Flowers follow-up SMS" : `Hall of Flowers follow-up SMS ${smsStatusLabel(smsResult.status)}`,
      details: {
        source,
        provider: smsResult.provider,
        status: smsResult.status,
        provider_message_id: smsResult.providerMessageId,
        to: smsResult.to,
        error: smsResult.error,
      },
      actor_user_id: staff.userId,
    });

    await logPlatformEvent({
      eventType: "event.quick_add_lead",
      userId: staff.userId,
      metadata: {
        customer_id: customerId,
        action,
        source,
        interest,
        hot_lead: hotLead,
        sms_status: smsResult.status,
      },
    });

    return NextResponse.json({
      ok: true,
      customerId,
      action,
      source,
      sms: {
        ok: smsResult.ok,
        status: smsResult.status,
        error: smsResult.error,
        to: smsResult.to,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quick add failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
