import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isApprovedCustomerApprovalStatus } from "@/lib/customerApproval";

const DOCUMENTS_BUCKET = "catalog-public";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

type GenericRow = Record<string, unknown>;

const REQUIRED_DOC_KEYS = new Set(["cannabis_license", "sellers_permit", "w9", "irs_form_8300"]);

function firstText(...values: Array<unknown>): string | null {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return null;
}

function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "upload";
}

function extensionFromFile(file: File): string {
  const ext = String(file.name || "").split(".").pop()?.trim().toLowerCase() || "";
  return ext || "bin";
}

function isMissingColumnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: string }).code || "").toUpperCase()
      : "";
  const lower = message.toLowerCase();
  return code === "42703" || code === "PGRST204" || (lower.includes("column") && lower.includes("does not exist"));
}

function normalizeDocumentType(value: string): string {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

async function loadCustomerMembershipIds(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<string[]> {
  const primaryRes = await admin
    .from("customer_users")
    .select("customer_id, is_primary")
    .eq("user_id", userId)
    .order("is_primary", { ascending: false });

  if (!primaryRes.error) {
    return ((primaryRes.data || []) as GenericRow[])
      .map((row) => String(row.customer_id || "").trim())
      .filter(Boolean);
  }

  if (!isMissingColumnError(primaryRes.error)) {
    throw new Error(primaryRes.error.message);
  }

  const fallbackRes = await admin
    .from("customer_users")
    .select("customer_id")
    .eq("user_id", userId);

  if (fallbackRes.error) {
    throw new Error(fallbackRes.error.message);
  }

  return ((fallbackRes.data || []) as GenericRow[])
    .map((row) => String(row.customer_id || "").trim())
    .filter(Boolean);
}

async function resolveCustomerAccount(admin: ReturnType<typeof createAdminClient>, userId: string, email: string | null) {
  const membershipIds = await loadCustomerMembershipIds(admin, userId);

  const normalizedEmail = normalizeEmail(email);
  let companyName = "";
  let fallbackIds: string[] = [];

  const profileRes = await admin
    .from("profiles")
    .select("company_name")
    .eq("id", userId)
    .maybeSingle();
  if (profileRes.error && !isMissingColumnError(profileRes.error)) {
    throw new Error(profileRes.error.message);
  }
  companyName = String((profileRes.data as GenericRow | null)?.company_name || "").trim();

  if (normalizedEmail) {
    const [customerRes, contactRes] = await Promise.all([
      admin.from("customers").select("id").ilike("primary_contact_email", normalizedEmail),
      admin.from("customer_contacts").select("customer_id").ilike("email", normalizedEmail),
    ]);
    if (customerRes.error) throw new Error(customerRes.error.message);
    if (contactRes.error) throw new Error(contactRes.error.message);

    fallbackIds = [
      ...(customerRes.data || []).map((row: GenericRow) => String(row.id || "").trim()),
      ...(contactRes.data || []).map((row: GenericRow) => String(row.customer_id || "").trim()),
    ].filter(Boolean);
  }

  if (companyName) {
    const companyRes = await admin.from("customers").select("id").ilike("company_name", companyName);
    if (companyRes.error) throw new Error(companyRes.error.message);
    fallbackIds.push(...(companyRes.data || []).map((row: GenericRow) => String(row.id || "").trim()).filter(Boolean));
  }

  const customerIds = Array.from(new Set([...membershipIds, ...fallbackIds]));
  if (customerIds.length === 0) return null;

  const customersRes = await admin
    .from("customers")
    .select("id, approval_status, record_kind")
    .in("id", customerIds);
  if (customersRes.error) throw new Error(customersRes.error.message);

  const customers = ((customersRes.data || []) as GenericRow[]).filter((row) => {
    const recordKind = String(row.record_kind || "customer").trim().toLowerCase();
    return !recordKind || recordKind === "customer";
  });
  if (customers.length === 0) return null;

  const membershipCustomer = customers.find((row) => membershipIds.includes(String(row.id || "").trim()));
  const customer = membershipCustomer || customers[0];
  return {
    id: String(customer.id || "").trim(),
    approvalStatus: String(customer.approval_status || "").trim() || "pending",
  };
}

async function insertCustomerDocument(
  admin: ReturnType<typeof createAdminClient>,
  payload: {
    user_id: string;
    customer_account_id: string;
    title: string;
    file_name: string;
    document_type: string;
    bucket: string;
    object_path: string;
    file_url: string;
  }
) {
  const documentType = normalizeDocumentType(payload.document_type);
  const attempts: Array<Record<string, unknown>> = [
    {
      user_id: payload.user_id,
      customer_account_id: payload.customer_account_id,
      title: payload.title,
      file_name: payload.file_name,
      document_type: documentType,
      kind: documentType,
      bucket: payload.bucket,
      object_path: payload.object_path,
      file_url: payload.file_url,
      public_url: payload.file_url,
      url: payload.file_url,
    },
    {
      user_id: payload.user_id,
      customer_account_id: payload.customer_account_id,
      title: payload.title,
      file_name: payload.file_name,
      document_type: documentType,
      kind: documentType,
      file_url: payload.file_url,
      public_url: payload.file_url,
      url: payload.file_url,
    },
    {
      user_id: payload.user_id,
      customer_account_id: payload.customer_account_id,
      title: payload.title,
      file_name: payload.file_name,
      document_type: documentType,
      kind: documentType,
    },
    {
      user_id: payload.user_id,
      customer_account_id: payload.customer_account_id,
      title: payload.title,
      document_type: documentType,
      kind: documentType,
    },
    {
      user_id: payload.user_id,
      customer_account_id: payload.customer_account_id,
      document_type: documentType,
      kind: documentType,
    },
  ];

  let lastError: unknown = null;
  for (const attempt of attempts) {
    const result = await admin.from("customer_documents").insert(attempt).select("id").maybeSingle();
    if (!result.error) return result.data;
    lastError = result.error;
    if (!isMissingColumnError(result.error)) {
      throw new Error(result.error.message);
    }
  }

  throw new Error(lastError instanceof Error ? lastError.message : "Failed to save customer document");
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user ?? null;

    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const form = await req.formData();
    const admin = createAdminClient();
    const customer = await resolveCustomerAccount(admin, user.id, user.email || null);

    if (!customer?.id) {
      return NextResponse.json({ error: "No linked customer account found for this user." }, { status: 400 });
    }

    const uploads = await Promise.all(
      Array.from(form.entries())
        .filter(([key, value]) => REQUIRED_DOC_KEYS.has(key) && value instanceof File && value.size > 0)
        .map(async ([key, value]) => ({ key: normalizeDocumentType(key), file: value as File }))
    );

    if (uploads.length === 0) {
      return NextResponse.json({ error: "Upload at least one onboarding document." }, { status: 400 });
    }

    for (const upload of uploads) {
      if (upload.file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ error: `${upload.file.name} exceeds the 10MB limit.` }, { status: 400 });
      }
    }

    const insertedDocuments: Array<{ id?: string; documentType: string; title: string }> = [];

    for (const upload of uploads) {
      const ext = extensionFromFile(upload.file);
      const objectPath = `customer-documents/${customer.id}/${upload.key}/${Date.now()}-${safeFileName(upload.file.name || `${upload.key}.${ext}`)}`;
      const contentType = String(upload.file.type || "").trim() || "application/octet-stream";
      const bytes = new Uint8Array(await upload.file.arrayBuffer());

      const storageRes = await admin.storage.from(DOCUMENTS_BUCKET).upload(objectPath, bytes, {
        upsert: true,
        contentType,
      });
      if (storageRes.error) {
        return NextResponse.json({ error: `Storage upload failed: ${storageRes.error.message}` }, { status: 500 });
      }

      const { data: publicData } = admin.storage.from(DOCUMENTS_BUCKET).getPublicUrl(objectPath);
      const fileUrl = String(publicData?.publicUrl || "").trim();

      const inserted = await insertCustomerDocument(admin, {
        user_id: user.id,
        customer_account_id: customer.id,
        title: upload.file.name || upload.key,
        file_name: upload.file.name || `${upload.key}.${ext}`,
        document_type: upload.key,
        bucket: DOCUMENTS_BUCKET,
        object_path: objectPath,
        file_url: fileUrl,
      });
      insertedDocuments.push({
        id: firstText((inserted as GenericRow | null)?.id) || undefined,
        documentType: upload.key,
        title: upload.file.name || upload.key,
      });
    }

    if (!isApprovedCustomerApprovalStatus(customer.approvalStatus)) {
      const updateRes = await admin
        .from("customers")
        .update({ approval_status: "needs_review" })
        .eq("id", customer.id)
        .neq("approval_status", "approved");
      if (updateRes.error && !isMissingColumnError(updateRes.error)) {
        return NextResponse.json({ error: `Approval status update failed: ${updateRes.error.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      customer_account_id: customer.id,
      documents: insertedDocuments,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
