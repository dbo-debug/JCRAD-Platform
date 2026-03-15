import { NextResponse } from "next/server";
import { applyCustomerImport } from "@/lib/customerImport";
import { getStaffContext } from "@/lib/getStaffContext";

export async function POST(req: Request) {
  const staff = await getStaffContext();
  if (!staff || staff.role !== "admin") {
    return NextResponse.json({ error: "Only admins can apply imports" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const spreadsheetIdOrUrl = String(body.spreadsheet_id_or_url || "").trim();
  const tabName = String(body.tab_name || "").trim();
  const mapping = body.mapping && typeof body.mapping === "object" ? body.mapping : undefined;
  const importNotes = body.import_notes === true;

  if (!spreadsheetIdOrUrl || !tabName) {
    return NextResponse.json({ error: "spreadsheet_id_or_url and tab_name are required" }, { status: 400 });
  }

  try {
    const result = await applyCustomerImport({
      spreadsheetIdOrUrl,
      tabName,
      mapping,
      importNotes,
      actorUserId: staff.userId,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Apply failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
