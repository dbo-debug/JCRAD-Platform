"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type {
  EmailCampaignDetail,
  EmailCampaignSummary,
  EmailRecipientOption,
} from "@/lib/emailCampaignWorkspace";
import EmailIdentitySetup from "@/components/workspace/EmailIdentitySetup";

type EmailsWorkspaceProps = {
  campaigns: EmailCampaignSummary[];
  selectedCampaign: EmailCampaignDetail | null;
  recipientOptions: EmailRecipientOption[];
};

type CampaignFormState = {
  name: string;
  subject: string;
  preheader: string;
  introText: string;
  imagePath: string | null;
  imageUrl: string | null;
  imageAltText: string;
  primaryCtaLabel: string;
  primaryCtaUrl: string;
  secondaryCtaLabel: string;
  secondaryCtaUrl: string;
  includeVapeComplianceFooter: boolean;
  batchLabel: string;
  territoryCode: string;
  routeDay: string;
  status: "draft" | "sent" | "archived";
};

type GmailStatus =
  | { loading: true; connected: false; gmailEmail: null; error: null }
  | { loading: false; connected: true; gmailEmail: string; error: null }
  | { loading: false; connected: false; gmailEmail: null; error: string | null };

const EMAIL_CAMPAIGN_WORKING_GROUP_HANDOFF_KEY = "jc-rad:email-campaign-working-group";

function buildWorkingGroupRecipientEmails(recipientOptions: EmailRecipientOption[], customerIds: string[]) {
  const grouped = new Map<string, EmailRecipientOption[]>();

  recipientOptions.forEach((recipient) => {
    const existing = grouped.get(recipient.customerId) || [];
    existing.push(recipient);
    grouped.set(recipient.customerId, existing);
  });

  return customerIds
    .map((customerId) => {
      const options = grouped.get(customerId) || [];
      const primary = options.find((option) => option.source === "primary") || options[0] || null;
      return primary?.email || null;
    })
    .filter((email, index, values): email is string => Boolean(email) && values.indexOf(email) === index)
    .slice(0, 50);
}

function campaignToForm(campaign: EmailCampaignDetail | null): CampaignFormState {
  return {
    name: campaign?.name || "",
    subject: campaign?.subject || "",
    preheader: campaign?.preheader || "",
    introText: campaign?.introText || "",
    imagePath: campaign?.imagePath || null,
    imageUrl: campaign?.imageUrl || null,
    imageAltText: campaign?.imageAltText || "",
    primaryCtaLabel: campaign?.primaryCtaLabel || "Setup Meeting",
    primaryCtaUrl: campaign?.primaryCtaUrl || "",
    secondaryCtaLabel: campaign?.secondaryCtaLabel || "Check Out Menu",
    secondaryCtaUrl: campaign?.secondaryCtaUrl || "",
    includeVapeComplianceFooter: campaign?.includeVapeComplianceFooter || false,
    batchLabel: campaign?.batchLabel || "",
    territoryCode: campaign?.territoryCode || "",
    routeDay: campaign?.routeDay || "",
    status: campaign?.status || "draft",
  };
}

function summarizeCampaign(campaign: EmailCampaignSummary) {
  return `${campaign.counts.accepted} accepted • ${campaign.counts.failed} failed • ${campaign.counts.bounced} bounced • ${campaign.counts.replied} replied`;
}

function relativeDate(value: string | null) {
  if (!value) return "Not sent yet";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Not sent yet";
  return new Date(parsed).toLocaleString();
}

function statusTone(status: string) {
  if (status === "sent") return "border-[#e8d7f7] bg-[#fcf3ff] text-[#6f32b5]";
  if (status === "failed") return "border-[#f1d1d1] bg-[#fff5f5] text-[#991b1b]";
  if (status === "bounced") return "border-[#f1ddad] bg-[#fff9eb] text-[#9a6b00]";
  if (status === "archived") return "border-[#e5d8ef] bg-[#fcf7fd] text-[#4f6877]";
  return "border-[#f1ddad] bg-[#fff9eb] text-[#9a6b00]";
}

export default function EmailsWorkspace(props: EmailsWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const workingGroupRecipientEmailsRef = useRef<string[] | null>(null);
  const workingGroupHandoffAppliedRef = useRef(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(props.selectedCampaign?.id || props.campaigns[0]?.id || null);
  const [form, setForm] = useState<CampaignFormState>(campaignToForm(props.selectedCampaign));
  const [selectedRecipientEmails, setSelectedRecipientEmails] = useState<string[]>(
    props.selectedCampaign?.recipients.map((recipient) => recipient.email) || []
  );
  const [recipientQuery, setRecipientQuery] = useState("");
  const [gmailStatus, setGmailStatus] = useState<GmailStatus>({ loading: true, connected: false, gmailEmail: null, error: null });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedCampaignId(props.selectedCampaign?.id || props.campaigns[0]?.id || null);
    setForm(campaignToForm(props.selectedCampaign));
    const campaignRecipientEmails = props.selectedCampaign?.recipients.map((recipient) => recipient.email) || [];
    setSelectedRecipientEmails(campaignRecipientEmails.length > 0 ? campaignRecipientEmails : workingGroupRecipientEmailsRef.current || []);
  }, [props.selectedCampaign, props.campaigns]);

  useEffect(() => {
    if (workingGroupHandoffAppliedRef.current) return;

    try {
      const raw = window.sessionStorage.getItem(EMAIL_CAMPAIGN_WORKING_GROUP_HANDOFF_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as { customerIds?: unknown };
      const customerIds = Array.isArray(parsed.customerIds)
        ? parsed.customerIds.map((value) => String(value || "").trim()).filter(Boolean)
        : [];
      const workingGroupEmails = buildWorkingGroupRecipientEmails(props.recipientOptions, customerIds);

      window.sessionStorage.removeItem(EMAIL_CAMPAIGN_WORKING_GROUP_HANDOFF_KEY);
      workingGroupHandoffAppliedRef.current = true;

      if (workingGroupEmails.length === 0) {
        setMessage("Working group was handed off, but no valid recipient emails were found.");
        return;
      }

      workingGroupRecipientEmailsRef.current = workingGroupEmails;
      setSelectedRecipientEmails(workingGroupEmails);
      setMessage(`Loaded ${workingGroupEmails.length} recipient${workingGroupEmails.length === 1 ? "" : "s"} from the working group.`);
    } catch {
      window.sessionStorage.removeItem(EMAIL_CAMPAIGN_WORKING_GROUP_HANDOFF_KEY);
      workingGroupHandoffAppliedRef.current = true;
    }
  }, [props.recipientOptions]);

  useEffect(() => {
    let active = true;
    async function loadStatus() {
      try {
        const res = await fetch("/api/workspace/email/connection", { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok || json.connected !== true) {
          setGmailStatus({
            loading: false,
            connected: false,
            gmailEmail: null,
            error: String(json.error || "Connect a Google mailbox before sending."),
          });
          return;
        }
        setGmailStatus({
          loading: false,
          connected: true,
          gmailEmail: String(json.connection?.gmailEmail || ""),
          error: null,
        });
      } catch (loadError) {
        if (!active) return;
        setGmailStatus({
          loading: false,
          connected: false,
          gmailEmail: null,
          error: loadError instanceof Error ? loadError.message : "Unable to load Gmail connection status",
        });
      }
    }
    void loadStatus();
    return () => {
      active = false;
    };
  }, []);

  const filteredRecipients = useMemo(() => {
    const query = recipientQuery.trim().toLowerCase();
    if (!query) return props.recipientOptions;
    return props.recipientOptions.filter((recipient) =>
      [recipient.companyName, recipient.contactName, recipient.email].some((value) =>
        String(value || "").toLowerCase().includes(query)
      )
    );
  }, [props.recipientOptions, recipientQuery]);
  const selectedRecipientOptions = useMemo(
    () => props.recipientOptions.filter((recipient) => selectedRecipientEmails.includes(recipient.email)),
    [props.recipientOptions, selectedRecipientEmails]
  );

  function openCampaign(id: string) {
    setSelectedCampaignId(id);
    router.replace(`${pathname}?campaign=${encodeURIComponent(id)}`);
  }

  async function createCampaign() {
    setBusy("create");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/workspace/emails/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(json.error || `Create failed (${res.status})`));
      router.replace(`${pathname}?campaign=${encodeURIComponent(String(json.id || ""))}`);
      router.refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Create failed");
    } finally {
      setBusy(null);
    }
  }

  async function saveCampaign() {
    if (!selectedCampaignId) {
      setError("Create a campaign first.");
      return;
    }
    setBusy("save");
    setError(null);
    setMessage(null);
    try {
      await persistCampaign();
      setMessage("Campaign draft saved.");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function uploadImage(file: File) {
    if (!selectedCampaignId) {
      setError("Create a campaign before uploading the flyer image.");
      return;
    }

    setBusy("upload");
    setError(null);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/workspace/emails/campaigns/${encodeURIComponent(selectedCampaignId)}/upload-image`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(json.error || `Upload failed (${res.status})`));
      setForm((current) => ({
        ...current,
        imagePath: String(json.image_path || ""),
        imageUrl: String(json.image_url || ""),
      }));
      setMessage("Campaign flyer image uploaded.");
      router.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    if (!selectedCampaignId) {
      setError("Create a campaign first.");
      return;
    }
    setBusy("test");
    setError(null);
    setMessage(null);
    try {
      await persistCampaign();
      const res = await fetch(`/api/workspace/emails/campaigns/${encodeURIComponent(selectedCampaignId)}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(json.error || `Test send failed (${res.status})`));
      setMessage(`Test email sent to ${String(json.to || gmailStatus.gmailEmail || "connected mailbox")}.`);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Test send failed");
    } finally {
      setBusy(null);
    }
  }

  async function sendBatch() {
    if (!selectedCampaignId) {
      setError("Create a campaign first.");
      return;
    }
    if (selectedRecipientOptions.length === 0) {
      setError("Select at least one recipient.");
      return;
    }
    setBusy("send");
    setError(null);
    setMessage(null);
    try {
      await persistCampaign();
      const res = await fetch(`/api/workspace/emails/campaigns/${encodeURIComponent(selectedCampaignId)}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: selectedRecipientOptions.map((recipient) => ({
            customer_id: recipient.customerId,
            contact_id: recipient.contactId,
            email: recipient.email,
            company_name: recipient.companyName,
            contact_name: recipient.contactName,
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(json.error || `Send failed (${res.status})`));
      setMessage(`Campaign send finished: ${Number(json.sentCount || 0)} sent, ${Number(json.failedCount || 0)} failed.`);
      router.refresh();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Send failed");
    } finally {
      setBusy(null);
    }
  }

  async function refreshMailboxOutcomes() {
    setBusy("sync");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/workspace/email/sync", {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(json.error || `Sync failed (${res.status})`));
      setMessage(
        `Mailbox sync finished: ${Number(json.bouncedCount || 0)} bounced, ${Number(json.repliedCount || 0)} replied.`
      );
      router.refresh();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Mailbox sync failed");
    } finally {
      setBusy(null);
    }
  }

  function toggleRecipient(email: string) {
    workingGroupRecipientEmailsRef.current = null;
    setSelectedRecipientEmails((current) =>
      current.includes(email) ? current.filter((item) => item !== email) : [...current, email].slice(0, 50)
    );
  }

  async function persistCampaign() {
    if (!selectedCampaignId) {
      throw new Error("Create a campaign first.");
    }

    const res = await fetch(`/api/workspace/emails/campaigns/${encodeURIComponent(selectedCampaignId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        subject: form.subject,
        preheader: form.preheader || null,
        intro_text: form.introText || null,
        image_path: form.imagePath,
        image_url: form.imageUrl,
        image_alt_text: form.imageAltText || null,
        primary_cta_label: form.primaryCtaLabel || null,
        primary_cta_url: form.primaryCtaUrl || null,
        secondary_cta_label: form.secondaryCtaLabel || null,
        secondary_cta_url: form.secondaryCtaUrl || null,
        include_vape_compliance_footer: form.includeVapeComplianceFooter,
        batch_label: form.batchLabel || null,
        territory_code: form.territoryCode || null,
        route_day: form.routeDay || null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <div className="rounded-[24px] border border-[#e9def1] bg-white p-4 shadow-sm">
          <button
            type="button"
            onClick={() => void createCampaign()}
            disabled={busy === "create"}
            className="w-full rounded-full bg-[#173543] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy === "create" ? "Creating..." : "New Campaign"}
          </button>
          <div className="mt-4 space-y-2">
            {props.campaigns.map((campaign) => (
              <button
                key={campaign.id}
                type="button"
                onClick={() => openCampaign(campaign.id)}
                className={[
                  "w-full rounded-2xl border px-3 py-3 text-left transition",
                  selectedCampaignId === campaign.id
                    ? "border-[#8f52dc] bg-[#effcf8]"
                    : "border-[#e9def1] bg-[#fdf8fd] hover:border-[#c5d9e3] hover:bg-white",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-semibold text-[#173543]">{campaign.name}</p>
                  <span className={["rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", statusTone(campaign.status)].join(" ")}>
                    {campaign.status}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm text-[#5c7483]">{campaign.subject}</p>
                <p className="mt-2 text-xs text-[#6d8593]">{summarizeCampaign(campaign)}</p>
              </button>
            ))}
            {props.campaigns.length === 0 ? <div className="rounded-2xl border border-dashed border-[#e9def1] bg-[#fdf8fd] px-3 py-4 text-sm text-[#5c7483]">No campaigns yet.</div> : null}
          </div>
        </div>

        <EmailIdentitySetup
          returnTo={pathname + (selectedCampaignId ? `?campaign=${encodeURIComponent(selectedCampaignId)}` : "")}
        />
      </aside>

      <div className="space-y-6">
        {error ? <p className="rounded-xl border border-[#f1d1d1] bg-[#fff5f5] px-3 py-2 text-sm text-[#991b1b]">{error}</p> : null}
        {message ? <p className="rounded-xl border border-[#bfe8df] bg-[#effcf8] px-3 py-2 text-sm text-[#6f32b5]">{message}</p> : null}

        <section className="rounded-[24px] border border-[#e9def1] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7891a0]">Emails</p>
              <h2 className="mt-1 text-xl font-semibold text-[#173543]">Small-batch flyer outreach</h2>
              <p className="mt-1 text-sm text-[#5c7483]">Build image-led rep introduction and area outreach emails without turning the CRM into a newsletter system.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void saveCampaign()} disabled={!selectedCampaignId || busy !== null} className="rounded-full border border-[#ddcfe9] bg-white px-4 py-2 text-sm font-semibold text-[#21424d] disabled:opacity-60">
                {busy === "save" ? "Saving..." : "Save Draft"}
              </button>
              <button type="button" onClick={() => void sendTest()} disabled={!selectedCampaignId || busy !== null || !gmailStatus.connected} className="rounded-full border border-[#ddcfe9] bg-white px-4 py-2 text-sm font-semibold text-[#21424d] disabled:opacity-60">
                {busy === "test" ? "Sending..." : "Send Test"}
              </button>
              <button type="button" onClick={() => void refreshMailboxOutcomes()} disabled={busy !== null || !gmailStatus.connected} className="rounded-full border border-[#ddcfe9] bg-white px-4 py-2 text-sm font-semibold text-[#21424d] disabled:opacity-60">
                {busy === "sync" ? "Refreshing..." : "Refresh Outcomes"}
              </button>
              <button type="button" onClick={() => void sendBatch()} disabled={!selectedCampaignId || busy !== null || !gmailStatus.connected || selectedRecipientOptions.length === 0} className="rounded-full bg-[#8f52dc] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {busy === "send" ? "Sending..." : `Send Batch (${selectedRecipientOptions.length})`}
              </button>
            </div>
          </div>

          {!selectedCampaignId ? (
            <div className="mt-4 rounded-2xl border border-dashed border-[#e9def1] bg-[#fdf8fd] px-4 py-6 text-sm text-[#5c7483]">
              Create a campaign to start composing flyer-based outreach.
            </div>
          ) : (
            <div className="mt-4 grid gap-6 2xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
              <div className="space-y-6">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Campaign Name">
                    <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className={inputClass} />
                  </Field>
                  <Field label="Subject">
                    <input value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} className={inputClass} />
                  </Field>
                  <Field label="Preheader">
                    <input value={form.preheader} onChange={(event) => setForm((current) => ({ ...current, preheader: event.target.value }))} className={inputClass} />
                  </Field>
                  <Field label="Image Alt Text">
                    <input value={form.imageAltText} onChange={(event) => setForm((current) => ({ ...current, imageAltText: event.target.value }))} className={inputClass} />
                  </Field>
                  <Field label="Batch Label">
                    <input value={form.batchLabel} onChange={(event) => setForm((current) => ({ ...current, batchLabel: event.target.value }))} className={inputClass} />
                  </Field>
                  <Field label="Territory Code">
                    <input value={form.territoryCode} onChange={(event) => setForm((current) => ({ ...current, territoryCode: event.target.value }))} className={inputClass} />
                  </Field>
                  <Field label="Route Day" className="md:col-span-2">
                    <input value={form.routeDay} onChange={(event) => setForm((current) => ({ ...current, routeDay: event.target.value }))} className={inputClass} />
                  </Field>
                  <Field label="Intro Text" className="md:col-span-2">
                    <textarea value={form.introText} onChange={(event) => setForm((current) => ({ ...current, introText: event.target.value }))} rows={4} className={textareaClass} />
                  </Field>
                </div>

                <div className="rounded-2xl border border-[#e9def1] bg-[#fdf8fd] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#173543]">Flyer Image</p>
                      <p className="mt-1 text-sm text-[#5c7483]">V1 uses one uploaded image and renders CTA buttons below it for better email client compatibility.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy !== null} className="rounded-full border border-[#ddcfe9] bg-white px-4 py-2 text-sm font-semibold text-[#21424d] disabled:opacity-60">
                        {busy === "upload" ? "Uploading..." : "Upload Flyer"}
                      </button>
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadImage(file);
                      event.currentTarget.value = "";
                    }}
                  />
                  {form.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.imageUrl} alt={form.imageAltText || form.subject} className="mt-4 w-full rounded-2xl border border-[#e9def1] bg-white object-cover" />
                  ) : <div className="mt-4 rounded-2xl border border-dashed border-[#e9def1] bg-white px-4 py-8 text-sm text-[#5c7483]">No flyer uploaded yet.</div>}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Primary CTA Label">
                    <input value={form.primaryCtaLabel} onChange={(event) => setForm((current) => ({ ...current, primaryCtaLabel: event.target.value }))} className={inputClass} />
                  </Field>
                  <Field label="Primary CTA URL">
                    <input value={form.primaryCtaUrl} onChange={(event) => setForm((current) => ({ ...current, primaryCtaUrl: event.target.value }))} className={inputClass} />
                  </Field>
                  <Field label="Secondary CTA Label">
                    <input value={form.secondaryCtaLabel} onChange={(event) => setForm((current) => ({ ...current, secondaryCtaLabel: event.target.value }))} className={inputClass} />
                  </Field>
                  <Field label="Secondary CTA URL">
                    <input value={form.secondaryCtaUrl} onChange={(event) => setForm((current) => ({ ...current, secondaryCtaUrl: event.target.value }))} className={inputClass} />
                  </Field>
                </div>

                <div className="rounded-2xl border border-[#e9def1] bg-[#fdf8fd] p-4">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={form.includeVapeComplianceFooter}
                      onChange={(event) => setForm((current) => ({ ...current, includeVapeComplianceFooter: event.target.checked }))}
                      className="mt-1 h-4 w-4 rounded border-[#ddcfe9] text-[#8f52dc]"
                    />
                    <span>
                      <span className="block font-semibold text-[#173543]">Append vape compliance footer</span>
                      <span className="mt-1 block text-sm text-[#5c7483]">
                        Enable this when the campaign includes vape or AIO products so the compliance notice is appended under the standard signature footer.
                      </span>
                    </span>
                  </label>
                </div>

                <div className="rounded-2xl border border-[#e9def1] bg-[#fdf8fd] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#173543]">Recipient Preview</p>
                      <p className="mt-1 text-sm text-[#5c7483]">Choose valid CRM contacts only. Blank or invalid emails are excluded automatically. Max 50 per batch.</p>
                    </div>
                    <input value={recipientQuery} onChange={(event) => setRecipientQuery(event.target.value)} placeholder="Search company, contact, email" className={[inputClass, "w-full max-w-xs"].join(" ")} />
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {filteredRecipients.slice(0, 120).map((recipient) => {
                      const checked = selectedRecipientEmails.includes(recipient.email);
                      return (
                        <label key={recipient.key} className="flex items-start gap-3 rounded-2xl border border-[#e9def1] bg-white px-3 py-3">
                          <input type="checkbox" checked={checked} onChange={() => toggleRecipient(recipient.email)} className="mt-1 h-4 w-4 rounded border-[#ddcfe9] text-[#8f52dc]" />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-[#173543]">{recipient.companyName}</span>
                            <span className="mt-1 block truncate text-sm text-[#4f6877]">{recipient.contactName || "No contact name"} • {recipient.email}</span>
                            <span className="mt-1 block text-xs uppercase tracking-wide text-[#7a93a2]">{recipient.source === "primary" ? "Primary email" : "Contact email"}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-[24px] border border-[#e9def1] bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7891a0]">Preview</p>
                  <div className="mt-3 rounded-[24px] border border-[#e9def1] bg-[#eef4f7] p-4">
                    <div className="mx-auto max-w-[520px] rounded-[24px] bg-white p-5 shadow-sm">
                      {form.preheader ? <p className="text-xs uppercase tracking-[0.12em] text-[#7a93a2]">{form.preheader}</p> : null}
                      {form.introText ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#355160]">{form.introText}</p> : null}
                      {form.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={form.imageUrl} alt={form.imageAltText || form.subject} className="mt-4 w-full rounded-[18px] border border-[#e9def1]" />
                      ) : null}
                      {form.primaryCtaLabel && form.primaryCtaUrl ? <a href={form.primaryCtaUrl} className="mt-4 inline-flex rounded-full bg-[#173543] px-5 py-3 text-sm font-semibold text-white"> {form.primaryCtaLabel} </a> : null}
                      {form.secondaryCtaLabel && form.secondaryCtaUrl ? <a href={form.secondaryCtaUrl} className="mt-3 inline-flex rounded-full border border-[#ddcfe9] bg-[#fcf5fb] px-5 py-3 text-sm font-semibold text-[#173543]"> {form.secondaryCtaLabel} </a> : null}
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#e9def1] bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7891a0]">Selected Recipients</p>
                      <p className="mt-1 text-sm text-[#5c7483]">{selectedRecipientOptions.length} selected for next send.</p>
                    </div>
                    <span className={["rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide", selectedRecipientOptions.length > 50 ? statusTone("failed") : statusTone("draft")].join(" ")}>
                      Max 50
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {selectedRecipientOptions.map((recipient) => (
                      <div key={recipient.key} className="rounded-2xl border border-[#e9def1] bg-[#fdf8fd] px-3 py-2 text-sm text-[#4f6877]">
                        <span className="font-semibold text-[#173543]">{recipient.companyName}</span> • {recipient.contactName || "No contact name"} • {recipient.email}
                      </div>
                    ))}
                    {selectedRecipientOptions.length === 0 ? <div className="rounded-2xl border border-dashed border-[#e9def1] bg-[#fdf8fd] px-4 py-4 text-sm text-[#5c7483]">No recipients selected.</div> : null}
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#e9def1] bg-white p-5 shadow-sm">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <OutcomeMetric label="Accepted" value={String(props.selectedCampaign?.recipients.filter((recipient) => Boolean(recipient.sentAt)).length || 0)} tone="ok" />
                    <OutcomeMetric label="Failed at Send" value={String(props.selectedCampaign?.recipients.filter((recipient) => recipient.status === "failed").length || 0)} tone="bad" />
                    <OutcomeMetric label="Bounced Later" value={String(props.selectedCampaign?.recipients.filter((recipient) => recipient.status === "bounced" || recipient.bouncedAt).length || 0)} tone="warn" />
                    <OutcomeMetric label="Replied" value={String(props.selectedCampaign?.recipients.filter((recipient) => Boolean(recipient.repliedAt)).length || 0)} tone="info" />
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#e9def1] bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7891a0]">Results</p>
                  <p className="mt-1 text-sm text-[#5c7483]">Accepted by Gmail is tracked separately from later bounce and reply outcomes.</p>
                  <div className="mt-3 space-y-2">
                    {props.selectedCampaign?.recipients.map((recipient) => (
                      <div key={recipient.id} className="rounded-2xl border border-[#e9def1] bg-[#fdf8fd] px-3 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-[#173543]">{recipient.email}</p>
                          <span className={["rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", statusTone(recipient.status)].join(" ")}>
                            {recipient.status}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-[#4f6877]">{recipient.companyName || "Unknown company"}{recipient.contactName ? ` • ${recipient.contactName}` : ""}</p>
                        <p className="mt-1 text-xs text-[#6d8593]">
                          Accepted {relativeDate(recipient.sentAt || recipient.createdAt)}
                          {recipient.bouncedAt ? ` • Bounced ${relativeDate(recipient.bouncedAt)}` : ""}
                          {recipient.repliedAt ? ` • Replied ${relativeDate(recipient.repliedAt)}` : ""}
                        </p>
                        {recipient.replyFromEmail ? <p className="mt-1 text-sm text-[#6f32b5]">Reply from {recipient.replyFromEmail}</p> : null}
                        {recipient.bounceReason ? <p className="mt-1 text-sm text-[#9a6b00]">{recipient.bounceReason}</p> : null}
                        {recipient.errorMessage ? <p className="mt-1 text-sm text-[#991b1b]">{recipient.errorMessage}</p> : null}
                      </div>
                    ))}
                    {props.selectedCampaign?.recipients.length ? null : <div className="rounded-2xl border border-dashed border-[#e9def1] bg-[#fdf8fd] px-4 py-4 text-sm text-[#5c7483]">No recipient history yet.</div>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={["grid gap-1 text-sm text-[#4a6575]", className || ""].join(" ")}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function OutcomeMetric({ label, value, tone }: { label: string; value: string; tone: "ok" | "bad" | "warn" | "info" }) {
  const toneClass =
    tone === "ok"
      ? "border-[#e8d7f7] bg-[#fcf3ff] text-[#6f32b5]"
      : tone === "bad"
        ? "border-[#f1d1d1] bg-[#fff5f5] text-[#991b1b]"
        : tone === "warn"
          ? "border-[#f1ddad] bg-[#fff9eb] text-[#9a6b00]"
          : "border-[#cfe1ff] bg-[#eef5ff] text-[#285ea8]";

  return (
    <div className={["rounded-2xl border px-4 py-3", toneClass].join(" ")}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

const inputClass = "w-full rounded-lg border border-[#ddcfe9] bg-white px-3 py-2 text-sm text-[#1f2d3a]";
const textareaClass = "w-full rounded-lg border border-[#ddcfe9] bg-white px-3 py-2 text-sm text-[#1f2d3a]";
