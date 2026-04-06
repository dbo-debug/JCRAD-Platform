type CampaignRenderInput = {
  subject: string;
  preheader?: string | null;
  introText?: string | null;
  imageUrl: string;
  imageAltText?: string | null;
  primaryCtaLabel?: string | null;
  primaryCtaUrl?: string | null;
  secondaryCtaLabel?: string | null;
  secondaryCtaUrl?: string | null;
  includeVapeComplianceFooter?: boolean;
};

function asText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderButton(label: string, url: string, tone: "primary" | "secondary") {
  const background = tone === "primary" ? "#173543" : "#f4f9fc";
  const foreground = tone === "primary" ? "#ffffff" : "#173543";
  const border = tone === "primary" ? "#173543" : "#cfe0e8";

  return `
    <tr>
      <td align="center" style="padding: 0 0 12px 0;">
        <a
          href="${escapeHtml(url)}"
          style="display:inline-block;border-radius:999px;padding:14px 24px;font-family:Arial,sans-serif;font-size:15px;font-weight:700;line-height:1;text-decoration:none;background:${background};color:${foreground};border:1px solid ${border};"
        >
          ${escapeHtml(label)}
        </a>
      </td>
    </tr>
  `;
}

export function renderCampaignEmail(input: CampaignRenderInput) {
  const preheader = asText(input.preheader);
  const introText = asText(input.introText);
  const imageAltText = asText(input.imageAltText) || input.subject;
  const primaryLabel = asText(input.primaryCtaLabel);
  const primaryUrl = asText(input.primaryCtaUrl);
  const secondaryLabel = asText(input.secondaryCtaLabel);
  const secondaryUrl = asText(input.secondaryCtaUrl);
  const signatureLines = [
    "Doug Boulware",
    "LA Area Rep | High 90s",
    "doug@high90s.com",
    "626-506-9415",
  ];
  const resourceLines = [
    { label: "Book Mtg", url: "https://calendar.app.google/49yMBarT6j85fSxi6" },
    { label: "Nabis Menu", url: "https://app.nabis.com/?nref=cb6mfmj9" },
  ];
  const disclaimerText =
    "Intended for licensed cannabis retailers and industry buyers only. Not for forwarding to consumers. Audience 21+.";
  const vapeComplianceText =
    "Compliance notice for integrated cannabis vaporizers: An empty integrated cannabis vaporizer shall be properly disposed of as hazardous waste at a household hazardous waste collection facility or other approved facility.";

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(input.subject)}</title>
      </head>
      <body style="margin:0;padding:0;background:#eef4f7;color:#173543;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
          ${escapeHtml(preheader || input.subject)}
        </div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef4f7;padding:24px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:24px;overflow:hidden;">
                ${
                  introText
                    ? `
                      <tr>
                        <td style="padding:28px 28px 20px 28px;font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#355160;">
                          ${escapeHtml(introText).replace(/\n/g, "<br />")}
                        </td>
                      </tr>
                    `
                    : ""
                }
                <tr>
                  <td style="padding:${introText ? "0 28px 20px 28px" : "28px 28px 20px 28px"};">
                    <img
                      src="${escapeHtml(input.imageUrl)}"
                      alt="${escapeHtml(imageAltText)}"
                      style="display:block;width:100%;height:auto;border:0;border-radius:18px;"
                    />
                  </td>
                </tr>
                ${primaryLabel && primaryUrl ? renderButton(primaryLabel, primaryUrl, "primary") : ""}
                ${secondaryLabel && secondaryUrl ? renderButton(secondaryLabel, secondaryUrl, "secondary") : ""}
                <tr>
                  <td style="padding:12px 28px 8px 28px;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:#173543;text-align:center;">
                    <div style="font-weight:700;font-style:italic;">${escapeHtml(signatureLines[0])}</div>
                    <div style="font-weight:700;font-style:italic;">${escapeHtml(signatureLines[1])}</div>
                    <div style="font-style:italic;">${escapeHtml(signatureLines[2])}</div>
                    <div style="font-style:italic;">${escapeHtml(signatureLines[3])}</div>
                    <div style="padding-top:10px;font-style:italic;">
                      <a href="${escapeHtml(resourceLines[0].url)}" style="color:#0f766e;text-decoration:none;font-weight:700;">${escapeHtml(resourceLines[0].label)}</a>
                    </div>
                    <div style="padding-top:4px;font-style:italic;">
                      <a href="${escapeHtml(resourceLines[1].url)}" style="color:#0f766e;text-decoration:none;font-weight:700;">${escapeHtml(resourceLines[1].label)}</a>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:4px 28px 28px 28px;font-family:Arial,sans-serif;font-size:12px;line-height:1.7;color:#8aa0ac;text-align:center;font-style:italic;">
                    ${escapeHtml(disclaimerText)}
                    ${
                      input.includeVapeComplianceFooter
                        ? `<div style="padding-top:10px;">${escapeHtml(vapeComplianceText)}</div>`
                        : ""
                    }
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `.trim();

  const textLines = [
    introText,
    input.imageUrl,
    primaryLabel && primaryUrl ? `${primaryLabel}: ${primaryUrl}` : null,
    secondaryLabel && secondaryUrl ? `${secondaryLabel}: ${secondaryUrl}` : null,
    ...signatureLines,
    ...resourceLines.map((item) => `${item.label}: ${item.url}`),
    disclaimerText,
    input.includeVapeComplianceFooter ? vapeComplianceText : null,
  ].filter(Boolean);

  return {
    html,
    text: textLines.join("\n\n"),
  };
}
