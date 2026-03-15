import crypto from "node:crypto";

type AppendOrderRow = {
  order_id: string;
  created_at: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  subtotal: number;
  adjustments: number;
  total: number;
  notes: string;
};

function base64url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function getAccessToken() {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_SHEETS_PRIVATE_KEY;

  if (!clientEmail || !privateKeyRaw) {
    throw new Error("Missing GOOGLE_SHEETS_CLIENT_EMAIL or GOOGLE_SHEETS_PRIVATE_KEY");
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey);
  const assertion = `${unsigned}.${base64url(signature)}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const tokenJson = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenJson?.access_token) {
    throw new Error(`Failed to get Google access token: ${tokenRes.status} ${JSON.stringify(tokenJson)}`);
  }

  return tokenJson.access_token as string;
}

function parseSpreadsheetId(input: string) {
  const trimmed = String(input || "").trim();
  if (!trimmed) throw new Error("Spreadsheet id is required");

  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] || trimmed;
}

export async function getSheetValues(args: { spreadsheetIdOrUrl: string; tabName: string }) {
  const spreadsheetId = parseSpreadsheetId(args.spreadsheetIdOrUrl);
  const tab = String(args.tabName || "").trim();
  if (!tab) throw new Error("Sheet tab name is required");

  const accessToken = await getAccessToken();
  const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tab)}`;

  const res = await fetch(readUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Failed reading sheet values: ${res.status} ${JSON.stringify(json)}`);
  }

  return {
    spreadsheetId,
    tabName: tab,
    values: Array.isArray(json?.values) ? (json.values as string[][]) : [],
  };
}

export async function appendOrderRowToSheet(row: AppendOrderRow) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.GOOGLE_SHEET_TAB || "Orders";

  if (!sheetId) {
    throw new Error("Missing GOOGLE_SHEET_ID");
  }

  const accessToken = await getAccessToken();

  const values = [[
    row.order_id,
    row.created_at,
    row.customer_name,
    row.customer_email,
    row.customer_phone,
    row.subtotal,
    row.adjustments,
    row.total,
    row.notes,
  ]];

  const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tab)}!A:I:append?valueInputOption=USER_ENTERED`;

  const res = await fetch(appendUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Failed appending order row to sheet: ${res.status} ${JSON.stringify(json)}`);
  }

  return json;
}
