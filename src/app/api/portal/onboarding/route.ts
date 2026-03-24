import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isApprovedCustomerApprovalStatus } from "@/lib/customerApproval";
import { CUSTOMER_DOCUMENTS_BUCKET, isPublicStorageBucket } from "@/lib/storageBuckets";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

type GenericRow = Record<string, unknown>;
type PreparedUpload = {
  document_type: string;
  title?: string;
  file_name?: string;
  content_type?: string;
  file_size?: number;
};
type FinalizedUpload = {
  document_type: string;
  title?: string;
  file_name?: string;
  content_type?: string;
  file_size?: number;
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

function firstNumber(...values: Array<unknown>): number | null {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
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
    doc_type: documentType,
    file_url: payload.file_url,
    status: "pending",
  } satisfies Record<string, unknown>;

  const preferredResult = await admin.from("customer_documents").insert(preferredPayload);
  if (!preferredResult.error) return;
  if (!isMissingColumnError(preferredResult.error)) {
    throw new Error(preferredResult.error.message);
  }

  const fallbackPayload = {
    user_id: payload.user_id,
    customer_account_id: payload.customer_account_id,
    document_type: documentType,
    bucket: payload.bucket,
    object_path: payload.object_path,
    file_url: payload.file_url,
  } satisfies Record<string, unknown>;

  const fallbackResult = await admin.from("customer_documents").insert(fallbackPayload);
  if (!fallbackResult.error) return;
  if (!isMissingColumnError(fallbackResult.error)) {
    throw new Error(fallbackResult.error.message);
  }

  throw new Error(`customer_documents insert failed: ${fallbackResult.error.message}`);
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
    const bucket = firstText(upload.bucket) || CUSTOMER_DOCUMENTS_BUCKET;
    const fileName = firstText(upload.file_name, upload.title) || `${documentType}.${objectPath.split(".").pop() || "bin"}`;
    const title = firstText(upload.title, upload.file_name) || fileName;
    let fileUrl = firstText(upload.file_url) || "";

    if (!objectPath) {
      throw new Error(`Missing storage path for ${documentType}.`);
    }

    const info = await args.admin.storage.from(bucket).info(objectPath);
    if (info.error) {
      throw new Error(`Uploaded file not found for ${documentType}: ${info.error.message}`);
    }

    if (!fileUrl && isPublicStorageBucket(bucket)) {
      const { data: publicData } = args.admin.storage.from(bucket).getPublicUrl(objectPath);
      fileUrl = String(publicData?.publicUrl || "").trim();
    }
    if (!fileUrl) {
      fileUrl = `${bucket}:${objectPath}`;
    }

    await insertCustomerDocument(args.admin, {
      user_id: args.userId,
      customer_account_id: args.customerId,
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

async function prepareUploads(args: {
  admin: ReturnType<typeof createAdminClient>;
  customerId: string;
  uploads: PreparedUpload[];
}) {
  const preparedUploads = [];

  for (const upload of args.uploads) {
    const documentType = normalizeDocumentType(upload.document_type);
    if (!REQUIRED_DOC_KEYS.has(documentType)) {
      throw new Error(`Unsupported onboarding document type: ${upload.document_type}`);
    }

    const fileName = firstText(upload.file_name, upload.title);
    if (!fileName) {
      throw new Error(`file_name required for ${documentType}`);
    }

    const fileSize = firstNumber(upload.file_size);
    if (fileSize != null && fileSize > MAX_UPLOAD_BYTES) {
      throw new Error(`${fileName} exceeds the 25MB limit.`);
    }

    const contentType = firstText(upload.content_type) || "application/octet-stream";
    const ext = String(fileName).split(".").pop()?.trim().toLowerCase() || "bin";
    const objectPath = `customer-documents/${args.customerId}/${documentType}/${Date.now()}-${safeFileName(fileName || `${documentType}.${ext}`)}`;
    const signed = await args.admin.storage.from(CUSTOMER_DOCUMENTS_BUCKET).createSignedUploadUrl(objectPath);
    if (signed.error || !signed.data?.token) {
      throw new Error(signed.error?.message || `Failed to prepare upload for ${fileName}`);
    }

    preparedUploads.push({
      document_type: documentType,
      title: firstText(upload.title, fileName) || fileName,
      file_name: fileName,
      content_type: contentType,
      file_size: fileSize,
      bucket: CUSTOMER_DOCUMENTS_BUCKET,
      object_path: objectPath,
      upload_token: String(signed.data.token),
      signed_url: String(signed.data.signedUrl || "").trim() || null,
    });
  }

  return preparedUploads;
}

export async function GET() {
  try {
    const context = await getAuthenticatedContext();
    if ("error" in context) return context.error;

    return NextResponse.json({
      ok: true,
      customer_account_id: context.customer.id,
      bucket: CUSTOMER_DOCUMENTS_BUCKET,
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
      const intent = String(body?.intent || "").trim().toLowerCase();

      if (intent === "prepare") {
        const uploads = Array.isArray(body?.uploads) ? (body.uploads as PreparedUpload[]) : [];
        if (uploads.length === 0) {
          return NextResponse.json({ error: "Select at least one onboarding document to upload." }, { status: 400 });
        }

        const preparedUploads = await prepareUploads({
          admin: context.admin,
          customerId: context.customer.id,
          uploads,
        });

        return NextResponse.json({
          ok: true,
          customer_account_id: context.customer.id,
          bucket: CUSTOMER_DOCUMENTS_BUCKET,
          uploads: preparedUploads,
        });
      }

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
    return NextResponse.json(
      { error: "Use the onboarding signed-upload JSON flow." },
      { status: 415 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
