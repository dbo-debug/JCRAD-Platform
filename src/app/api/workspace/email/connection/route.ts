import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getStaffContext } from "@/lib/getStaffContext";
import { getCrmCommunicationsEmailStatus } from "@/lib/email/crmEmailIdentities";

const GMAIL_OAUTH_STATUS_COOKIE = "jcrad_gmail_oauth_status";

export async function GET() {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const status = await getCrmCommunicationsEmailStatus(staff.userId);
  const cookieStore = await cookies();
  const oauthStatus = cookieStore.get(GMAIL_OAUTH_STATUS_COOKIE)?.value || null;

  const response = NextResponse.json({
    connected: status.ok,
    connection: status.ok ? status.connection : null,
    error: status.ok ? null : status.error,
    errorCode: status.ok ? null : status.code,
    oauthStatus,
  });

  if (oauthStatus) {
    response.cookies.set({
      name: GMAIL_OAUTH_STATUS_COOKIE,
      value: "",
      maxAge: 0,
      path: "/",
    });
  }

  return response;
}
