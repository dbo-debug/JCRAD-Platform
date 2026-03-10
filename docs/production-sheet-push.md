# Production Sheet Push (Apps Script)

Use this to push finished unit counts from Google Sheets into the app.

## Required Sheet Columns

- `estimate_line_id`: UUID from the app
- `finished_units`: integer produced in the run

## Endpoint

- `POST https://<your-domain>/api/production/finalize-line`
- Header: `x-production-secret: <PRODUCTION_PUSH_SECRET>`
- Body:

```json
{
  "estimate_line_id": "line-id-here",
  "finished_units": 120
}
```

## Apps Script Example

```javascript
const API_URL = "https://<your-domain>/api/production/finalize-line";
const SECRET = "your-production-push-secret";
const SHEET_NAME = "Production";
const ESTIMATE_LINE_ID_COL = 1; // column A
const FINISHED_UNITS_COL = 2; // column B

function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;
  if (e.range.getColumn() !== FINISHED_UNITS_COL) return;
  if (e.range.getRow() < 2) return; // skip header row

  const row = e.range.getRow();
  const estimateLineId = String(sheet.getRange(row, ESTIMATE_LINE_ID_COL).getValue() || "").trim();
  const finishedUnits = Number(sheet.getRange(row, FINISHED_UNITS_COL).getValue());

  if (!estimateLineId || !Number.isFinite(finishedUnits) || finishedUnits < 0) {
    Logger.log("Skipping row %s: invalid estimate_line_id or finished_units", row);
    return;
  }

  const response = UrlFetchApp.fetch(API_URL, {
    method: "post",
    contentType: "application/json",
    headers: {
      "x-production-secret": SECRET,
    },
    payload: JSON.stringify({
      estimate_line_id: estimateLineId,
      finished_units: Math.floor(finishedUnits),
    }),
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  const body = response.getContentText();

  if (status >= 200 && status < 300) {
    Logger.log("Finalize success row %s: %s", row, body);
  } else {
    Logger.log("Finalize error row %s (%s): %s", row, status, body);
  }
}
```
