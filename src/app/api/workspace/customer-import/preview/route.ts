import { NextResponse } from "next/server";
import { previewCustomerImport } from "@/lib/customerImport";
import { getStaffContext } from "@/lib/getStaffContext";

export async function POST(req: Request) {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const spreadsheetIdOrUrl = String(body.spreadsheet_id_or_url || "").trim();
  const tabName = String(body.tab_name || "").trim();
  const mapping = body.mapping && typeof body.mapping === "object" ? body.mapping : undefined;

  if (!spreadsheetIdOrUrl || !tabName) {
    return NextResponse.json({ error: "spreadsheet_id_or_url and tab_name are required" }, { status: 400 });
  }

  try {
    const preview = await previewCustomerImport({
      spreadsheetIdOrUrl,
      tabName,
      mapping,
    });
    return NextResponse.json(preview);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Preview failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
