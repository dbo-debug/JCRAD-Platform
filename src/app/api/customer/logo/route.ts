import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const LOGO_BUCKET = "catalog-public";
const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function isMissingColumnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: string }).code || "").toUpperCase()
      : "";
  const lower = message.toLowerCase();
  return code === "42703" || code === "PGRST204" || (lower.includes("column") && lower.includes("does not exist"));
}

function extensionFromFile(file: File): string | null {
  const fromName = String(file.name || "").split(".").pop()?.trim().toLowerCase() || "";
  if (IMAGE_EXTENSIONS.has(fromName)) return fromName === "jpeg" ? "jpg" : fromName;
  return IMAGE_MIME_EXTENSIONS[String(file.type || "").toLowerCase()] || null;
}

function normalizeLogoPayload(profile: Record<string, unknown> | null) {
  return {
    logo_url: String(profile?.logo_url || "").trim() || null,
    logo_bucket: String(profile?.logo_bucket || "").trim() || null,
    logo_object_path: String(profile?.logo_object_path || "").trim() || null,
  };
}

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

async function loadProfile(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error)) {
      throw new Error("Customer logo columns are missing. Run the latest Supabase migrations.");
    }
    throw new Error(error.message);
  }

  return (data as Record<string, unknown> | null) ?? null;
}

async function clearLogoMetadata(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await admin
    .from("profiles")
    .update({
      logo_url: null,
      logo_bucket: null,
      logo_object_path: null,
    })
    .eq("id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error)) {
      throw new Error("Customer logo columns are missing. Run the latest Supabase migrations.");
    }
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Customer profile not found.");
  }
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const profile = await loadProfile(admin, user.id);
    return NextResponse.json({ logo: normalizeLogoPayload(profile) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load logo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (file.size > MAX_LOGO_BYTES) {
    return NextResponse.json({ error: "Logo must be 5MB or smaller" }, { status: 400 });
  }

  const ext = extensionFromFile(file);
  if (!ext) {
    return NextResponse.json({ error: "Logo must be jpg, jpeg, png, or webp" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const currentProfile = await loadProfile(admin, user.id);
    const currentLogo = normalizeLogoPayload(currentProfile);
    const objectPath = `customer-logos/${user.id}/logo.${ext}`;

    const upload = await admin.storage.from(LOGO_BUCKET).upload(objectPath, file, {
      upsert: true,
      contentType: String(file.type || "").trim() || "application/octet-stream",
    });
    if (upload.error) {
      return NextResponse.json({ error: upload.error.message }, { status: 500 });
    }

    const { data: publicData } = admin.storage.from(LOGO_BUCKET).getPublicUrl(objectPath);
    const logoUrl = String(publicData?.publicUrl || "").trim();
    if (!logoUrl) {
      return NextResponse.json({ error: "Failed to generate logo URL" }, { status: 500 });
    }

    const { data: updatedProfile, error: updateError } = await admin
      .from("profiles")
      .update({
        logo_url: logoUrl,
        logo_bucket: LOGO_BUCKET,
        logo_object_path: objectPath,
      })
      .eq("id", user.id)
      .select("id")
      .maybeSingle();

    if (updateError) {
      if (isMissingColumnError(updateError)) {
        return NextResponse.json(
          { error: "Customer logo columns are missing. Run the latest Supabase migrations." },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    if (!updatedProfile) {
      return NextResponse.json({ error: "Customer profile not found." }, { status: 404 });
    }

    if (
      currentLogo.logo_bucket &&
      currentLogo.logo_object_path &&
      currentLogo.logo_bucket === LOGO_BUCKET &&
      currentLogo.logo_object_path !== objectPath
    ) {
      await admin.storage.from(currentLogo.logo_bucket).remove([currentLogo.logo_object_path]);
    }

    return NextResponse.json({
      logo: {
        logo_url: logoUrl,
        logo_bucket: LOGO_BUCKET,
        logo_object_path: objectPath,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Logo upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const currentProfile = await loadProfile(admin, user.id);
    const currentLogo = normalizeLogoPayload(currentProfile);

    await clearLogoMetadata(admin, user.id);

    if (currentLogo.logo_bucket && currentLogo.logo_object_path) {
      await admin.storage.from(currentLogo.logo_bucket).remove([currentLogo.logo_object_path]);
    }

    return NextResponse.json({
      logo: {
        logo_url: null,
        logo_bucket: null,
        logo_object_path: null,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to remove logo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
