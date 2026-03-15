"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type StaffOption = {
  userId: string;
  label: string;
};

type PrimaryContact = {
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
};

type CustomerDetailManagerProps = {
  customerId: string;
  companyName: string;
  status: string;
  stage: string | null;
  primaryContactEmail: string | null;
  assignedSalesUserId: string | null;
  staffRole: "admin" | "sales";
  salesOptions: StaffOption[];
  primaryContact: PrimaryContact | null;
};

async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return {};
  return res.json().catch(() => ({}));
}

export default function CustomerDetailManager(props: CustomerDetailManagerProps) {
  const router = useRouter();
  const [accountBusy, setAccountBusy] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);
  const [noteBusy, setNoteBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState(props.companyName);
  const [status, setStatus] = useState(props.status || "active");
  const [stage, setStage] = useState(props.stage || "new");
  const [primaryContactEmail, setPrimaryContactEmail] = useState(props.primaryContactEmail || "");
  const [assignedSalesUserId, setAssignedSalesUserId] = useState(props.assignedSalesUserId || "");

  const [contactName, setContactName] = useState(props.primaryContact?.name || "");
  const [contactEmail, setContactEmail] = useState(props.primaryContact?.email || "");
  const [contactPhone, setContactPhone] = useState(props.primaryContact?.phone || "");
  const [contactTitle, setContactTitle] = useState(props.primaryContact?.title || "");
  const [note, setNote] = useState("");

  async function refreshWithMessage(message: string) {
    setSuccess(message);
    setError(null);
    router.refresh();
  }

  async function saveAccount() {
    setAccountBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/workspace/customers/${props.customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName,
          status,
          stage,
          primary_contact_email: primaryContactEmail,
          assigned_sales_user_id: assignedSalesUserId || null,
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));
      await refreshWithMessage("Customer account updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setAccountBusy(false);
    }
  }

  async function savePrimaryContact() {
    setContactBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/workspace/customers/${props.customerId}/primary-contact`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contactName,
          email: contactEmail,
          phone: contactPhone,
          title: contactTitle,
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));
      await refreshWithMessage("Primary contact updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setContactBusy(false);
    }
  }

  async function createNote() {
    if (!note.trim()) {
      setError("Enter a note first.");
      return;
    }

    setNoteBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/workspace/customers/${props.customerId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));
      setNote("");
      await refreshWithMessage("Note added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setNoteBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[#dbe9ef] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[#173543]">Account Management</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Company Name</span>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={props.staffRole !== "admin" || accountBusy}
              className="rounded-lg border border-[#cfdde6] bg-white px-3 py-2 text-sm text-[#1f2d3a]"
            />
          </label>

          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Primary Contact Email</span>
            <input
              value={primaryContactEmail}
              onChange={(e) => setPrimaryContactEmail(e.target.value)}
              disabled={accountBusy}
              className="rounded-lg border border-[#cfdde6] bg-white px-3 py-2 text-sm text-[#1f2d3a]"
            />
          </label>

          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={accountBusy}
              className="rounded-lg border border-[#cfdde6] bg-white px-3 py-2 text-sm text-[#1f2d3a]"
            >
              {["active", "prospect", "lead", "on_hold", "inactive"].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Stage</span>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              disabled={accountBusy}
              className="rounded-lg border border-[#cfdde6] bg-white px-3 py-2 text-sm text-[#1f2d3a]"
            >
              {["new", "qualified", "active", "paused", "closed"].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm text-[#4a6575] md:col-span-2">
            <span>Assigned Sales Rep</span>
            <select
              value={assignedSalesUserId}
              onChange={(e) => setAssignedSalesUserId(e.target.value)}
              disabled={props.staffRole !== "admin" || accountBusy}
              className="rounded-lg border border-[#cfdde6] bg-white px-3 py-2 text-sm text-[#1f2d3a]"
            >
              <option value="">Unassigned</option>
              {props.salesOptions.map((option) => (
                <option key={option.userId} value={option.userId}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => void saveAccount()}
            disabled={accountBusy}
            className="rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {accountBusy ? "Saving..." : "Save Account"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-[#dbe9ef] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[#173543]">Primary Contact</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Name</span>
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} disabled={contactBusy} className="rounded-lg border border-[#cfdde6] bg-white px-3 py-2 text-sm text-[#1f2d3a]" />
          </label>
          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Title</span>
            <input value={contactTitle} onChange={(e) => setContactTitle(e.target.value)} disabled={contactBusy} className="rounded-lg border border-[#cfdde6] bg-white px-3 py-2 text-sm text-[#1f2d3a]" />
          </label>
          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Email</span>
            <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} disabled={contactBusy} className="rounded-lg border border-[#cfdde6] bg-white px-3 py-2 text-sm text-[#1f2d3a]" />
          </label>
          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Phone</span>
            <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} disabled={contactBusy} className="rounded-lg border border-[#cfdde6] bg-white px-3 py-2 text-sm text-[#1f2d3a]" />
          </label>
        </div>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => void savePrimaryContact()}
            disabled={contactBusy}
            className="rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {contactBusy ? "Saving..." : "Save Primary Contact"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-[#dbe9ef] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[#173543]">Add Internal Note</h2>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          disabled={noteBusy}
          className="mt-4 w-full rounded-lg border border-[#cfdde6] bg-white px-3 py-2 text-sm text-[#1f2d3a]"
          placeholder="Add relationship context, follow-up notes, or handoff details."
        />
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void createNote()}
            disabled={noteBusy}
            className="rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {noteBusy ? "Saving..." : "Add Note"}
          </button>
          {error ? <p className="text-sm text-[#991b1b]">{error}</p> : null}
          {success ? <p className="text-sm text-[#0f766e]">{success}</p> : null}
        </div>
      </section>
    </div>
  );
}
