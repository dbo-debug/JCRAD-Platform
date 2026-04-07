import { NextResponse } from "next/server";
import { getStaffContext } from "@/lib/getStaffContext";
import { syncGmailMailboxOutcomesForUser } from "@/lib/email/mailboxSync";

export async function POST() {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const result = await syncGmailMailboxOutcomesForUser(staff.userId);
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Mailbox sync failed",
      },
      { status: 400 }
    );
  }
}
