import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isApprovedCustomerApprovalStatus } from "@/lib/customerApproval";

const DOCUMENTS_BUCKET = "catalog-public";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

type GenericRow = Record<string, unknown>;
type FinalizedUpload = {
  document_type: string;
  title?: string;
  file_name?: string;
  bucket?: string;
  object_path?: string;
  file_url?: string;
};

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

async function getAuthenticatedContext() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user ?? null;

  if (!user) {
    return { error: NextResponse.json({ error: "Authentication required" }, { status: 401 }) } as const;
  }

  const admin = createAdminClient();
  const customer = await resolveCustomerAccount(admin, user.id, user.email || null);

  if (!customer?.id) {
    return {
      error: NextResponse.json({ error: "No linked customer account found for this user." }, { status: 400 }),
    } as const;
  }

  return { user, admin, customer } as const;
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
  const preferredPayload = {
    user_id: payload.user_id,
    customer_account_id: payload.customer_account_id,
    title: payload.title,
    file_name: payload.file_name,
    document_type: documentType,
    bucket: payload.bucket,
    object_path: payload.object_path,
    file_url: payload.file_url,
  } satisfies Record<string, unknown>;

  const preferredResult = await admin.from("customer_documents").insert(preferredPayload);
  if (!preferredResult.error) return;
  if (!isMissingColumnError(preferredResult.error)) {
    throw new Error(preferredResult.error.message);
  }

  const minimalPayload = {
    user_id: payload.user_id,
    customer_account_id: payload.customer_account_id,
    title: payload.title,
    file_name: payload.file_name,
    document_type: documentType,
  } satisfies Record<string, unknown>;

  const minimalResult = await admin.from("customer_documents").insert(minimalPayload);
  if (!minimalResult.error) return;
  if (!isMissingColumnError(minimalResult.error)) {
    throw new Error(minimalResult.error.message);
  }

  throw new Error(`customer_documents insert failed: ${minimalResult.error.message}`);
}

async function finalizeUploads(args: {
  admin: ReturnType<typeof createAdminClient>;
  userId: string;
  customerId: string;
  approvalStatus: string;
  uploads: FinalizedUpload[];
}) {
  const insertedDocuments: Array<{ id?: string; documentType: string; title: string }> = [];

  for (const upload of args.uploads) {
    const documentType = normalizeDocumentType(upload.document_type);
    if (!REQUIRED_DOC_KEYS.has(documentType)) {
      throw new Error(`Unsupported onboarding document type: ${upload.document_type}`);
    }
    const objectPath = firstText(upload.object_path) || "";
    const bucket = firstText(upload.bucket) || DOCUMENTS_BUCKET;
    const fileName = firstText(upload.file_name, upload.title) || `${documentType}.${objectPath.split(".").pop() || "bin"}`;
    const title = firstText(upload.title, upload.file_name) || fileName;
    let fileUrl = firstText(upload.file_url) || "";

    if (!objectPath) {
      throw new Error(`Missing storage path for ${documentType}.`);
    }

    if (!fileUrl) {
      const { data: publicData } = args.admin.storage.from(bucket).getPublicUrl(objectPath);
      fileUrl = String(publicData?.publicUrl || "").trim();
    }

    await insertCustomerDocument(args.admin, {
      user_id: args.userId,
      customer_account_id: args.customerId,
      title,
      file_name: fileName,
      document_type: documentType,
      bucket,
      object_path: objectPath,
      file_url: fileUrl,
    });
    insertedDocuments.push({
      documentType,
      title,
    });
  }

  if (!isApprovedCustomerApprovalStatus(args.approvalStatus)) {
    const updateRes = await args.admin
      .from("customers")
      .update({ approval_status: "needs_review" })
      .eq("id", args.customerId)
      .neq("approval_status", "approved");
    if (updateRes.error && !isMissingColumnError(updateRes.error)) {
      throw new Error(`Approval status update failed: ${updateRes.error.message}`);
    }
  }

  return insertedDocuments;
}

export async function GET() {
  try {
    const context = await getAuthenticatedContext();
    if ("error" in context) return context.error;

    return NextResponse.json({
      ok: true,
      customer_account_id: context.customer.id,
      bucket: DOCUMENTS_BUCKET,
      max_upload_bytes: MAX_UPLOAD_BYTES,
      required_document_types: Array.from(REQUIRED_DOC_KEYS),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to prepare onboarding upload";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const context = await getAuthenticatedContext();
    if ("error" in context) return context.error;

    const contentType = String(req.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => null);
      const uploads = Array.isArray(body?.uploads) ? (body.uploads as FinalizedUpload[]) : [];
      if (uploads.length === 0) {
        return NextResponse.json({ error: "Upload at least one onboarding document." }, { status: 400 });
      }

      const insertedDocuments = await finalizeUploads({
        admin: context.admin,
        userId: context.user.id,
        customerId: context.customer.id,
        approvalStatus: context.customer.approvalStatus,
        uploads,
      });

      return NextResponse.json({
        ok: true,
        customer_account_id: context.customer.id,
        documents: insertedDocuments,
      });
    }

    const form = await req.formData();
    const uploads = await Promise.all(
      Array.from(form.entries())
        .filter(([key, value]) => REQUIRED_DOC_KEYS.has(key) && value instanceof File && value.size > 0)
        .map(async ([key, value]) => ({ key: normalizeDocumentType(key), file: value as File }))
    );

    if (uploads.length === 0) {
      return NextResponse.json({ error: "Upload at least one onboarding document." }, { status: 400 });
    }

    const finalizedUploads: FinalizedUpload[] = [];
    for (const upload of uploads) {
      if (upload.file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ error: `${upload.file.name} exceeds the 10MB limit.` }, { status: 400 });
      }

      const ext = extensionFromFile(upload.file);
      const objectPath = `customer-documents/${context.customer.id}/${upload.key}/${Date.now()}-${safeFileName(upload.file.name || `${upload.key}.${ext}`)}`;
      const contentType = String(upload.file.type || "").trim() || "application/octet-stream";
      const bytes = new Uint8Array(await upload.file.arrayBuffer());

      const storageRes = await context.admin.storage.from(DOCUMENTS_BUCKET).upload(objectPath, bytes, {
        upsert: true,
        contentType,
      });
      if (storageRes.error) {
        return NextResponse.json({ error: `Storage upload failed: ${storageRes.error.message}` }, { status: 500 });
      }

      const { data: publicData } = context.admin.storage.from(DOCUMENTS_BUCKET).getPublicUrl(objectPath);
      finalizedUploads.push({
        document_type: upload.key,
        title: upload.file.name || upload.key,
        file_name: upload.file.name || `${upload.key}.${ext}`,
        bucket: DOCUMENTS_BUCKET,
        object_path: objectPath,
        file_url: String(publicData?.publicUrl || "").trim(),
      });
    }

    const insertedDocuments = await finalizeUploads({
      admin: context.admin,
      userId: context.user.id,
      customerId: context.customer.id,
      approvalStatus: context.customer.approvalStatus,
      uploads: finalizedUploads,
    });

    return NextResponse.json({
      ok: true,
      customer_account_id: context.customer.id,
      documents: insertedDocuments,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
