import { NextResponse } from "next/server";
import { getStaffContext } from "@/lib/getStaffContext";
import { getGmailConnectionStatus } from "@/lib/email/gmail";
import { listCrmEmailIdentities, upsertCrmEmailIdentity } from "@/lib/email/crmEmailIdentities";

function asText(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function GET() {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const [identities, gmailStatus] = await Promise.all([
      listCrmEmailIdentities(staff.userId),
      getGmailConnectionStatus(staff.userId),
    ]);

    return NextResponse.json({
      identities,
      connectedEmail: gmailStatus.ok ? gmailStatus.connection.gmailEmail : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load CRM email identities" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const email = asText(body.email)?.toLowerCase() || "";
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    const gmailStatus = await getGmailConnectionStatus(staff.userId);
    const connectedEmail = gmailStatus.ok ? gmailStatus.connection.gmailEmail.trim().toLowerCase() : null;
    const isConnectedMailbox = connectedEmail === email;

    const identity = await upsertCrmEmailIdentity({
      userId: staff.userId,
      email,
      displayName: asText(body.displayName),
      useForCommunications: body.useForCommunications !== false,
      useForAutomations: body.useForAutomations === true,
      gmailConnectionId: isConnectedMailbox && gmailStatus.ok ? gmailStatus.connection.id : null,
      verifiedAt: isConnectedMailbox ? new Date().toISOString() : null,
    });

    return NextResponse.json({ identity, connectedEmail });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save CRM email identity" },
      { status: 500 }
    );
  }
}
