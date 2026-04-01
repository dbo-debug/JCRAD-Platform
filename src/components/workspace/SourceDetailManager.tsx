"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type StaffOption = {
  userId: string;
  label: string;
};

type SourceDetailManagerProps = {
  sourceId: string;
  name: string;
  sourceType: string | null;
  companyName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: string;
  stage: string | null;
  notes: string | null;
  staffOptions: StaffOption[];
};

const sectionClass = "rounded-2xl border border-[#dbe9ef] bg-white p-4 shadow-sm";
const inputClass = "rounded-lg border border-[#cfdde6] bg-white px-3 py-2 text-sm text-[#1f2d3a]";
const sourcingPromptClass =
  "rounded-full border border-[#d7e6ed] bg-[#f8fbfc] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[#355564] transition hover:border-[#14b8a6] hover:bg-[#effcf9] hover:text-[#0f766e]";

const ACTIVITY_PROMPTS = [
  {
    label: "Supplier Call",
    activityType: "touchpoint",
    summary: "Spoke with supplier about current inventory, pricing, and next sourcing fit.",
    details:
      "Conversation notes:\n\nLead quality:\n\nMinor cannabinoid opportunity:\n\nNext step:",
  },
  {
    label: "Minor Cannabinoid Lead",
    activityType: "product_match",
    summary: "Logged a minor cannabinoid lead and captured supply fit.",
    details:
      "Cannabinoid or format:\n\nMOQ / pricing:\n\nLead quality:\n\nRequested follow-up:",
  },
  {
    label: "Sample Review",
    activityType: "sample_review",
    summary: "Reviewed incoming sample quality and sourcing viability.",
    details:
      "Sample notes:\n\nQuality / consistency:\n\nCommercial fit:\n\nNext action:",
  },
  {
    label: "Pricing Update",
    activityType: "price_update",
    summary: "Updated pricing and supply terms from the source.",
    details:
      "Price update:\n\nMOQ / terms:\n\nCompetitive read:\n\nNext follow-up:",
  },
] as const;

async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return {};
  return res.json().catch(() => ({}));
}

export default function SourceDetailManager(props: SourceDetailManagerProps) {
  const router = useRouter();
  const [profileBusy, setProfileBusy] = useState(false);
  const [activityBusy, setActivityBusy] = useState(false);
  const [taskBusy, setTaskBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [name, setName] = useState(props.name);
  const [sourceType, setSourceType] = useState(props.sourceType || "");
  const [companyName, setCompanyName] = useState(props.companyName || "");
  const [contactName, setContactName] = useState(props.contactName || "");
  const [contactEmail, setContactEmail] = useState(props.contactEmail || "");
  const [contactPhone, setContactPhone] = useState(props.contactPhone || "");
  const [status, setStatus] = useState(props.status || "active");
  const [stage, setStage] = useState(props.stage || "new");
  const [notes, setNotes] = useState(props.notes || "");

  const [activityType, setActivityType] = useState("touchpoint");
  const [activitySummary, setActivitySummary] = useState("");
  const [activityDetails, setActivityDetails] = useState("");
  const [activityOpportunity, setActivityOpportunity] = useState("");
  const [activityNextStep, setActivityNextStep] = useState("");
  const [activityFollowUpDate, setActivityFollowUpDate] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskAssignedUserId, setTaskAssignedUserId] = useState("");
  const [taskPriority, setTaskPriority] = useState("2");

  async function refreshWithMessage(message: string) {
    setSuccess(message);
    setError(null);
    router.refresh();
  }

  async function saveProfile() {
    setProfileBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/workspace/sources/${props.sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          source_type: sourceType || null,
          company_name: companyName || null,
          contact_name: contactName || null,
          contact_email: contactEmail || null,
          contact_phone: contactPhone || null,
          status,
          stage: stage || null,
          notes: notes || null,
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));
      await refreshWithMessage("Source profile updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setProfileBusy(false);
    }
  }

  async function createActivity() {
    if (!activitySummary.trim()) {
      setError("Enter an activity summary first.");
      return;
    }

    setActivityBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const trimmedDetails = activityDetails.trim();
      const trimmedOpportunity = activityOpportunity.trim();
      const trimmedNextStep = activityNextStep.trim();
      const details = {
        ...(trimmedDetails ? { notes: trimmedDetails } : {}),
        ...(trimmedOpportunity ? { opportunity: trimmedOpportunity } : {}),
        ...(trimmedNextStep ? { next_step: trimmedNextStep } : {}),
        ...(activityFollowUpDate ? { follow_up_on: activityFollowUpDate } : {}),
      };

      const res = await fetch(`/api/workspace/sources/${props.sourceId}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activity_type: activityType,
          summary: activitySummary,
          details: Object.keys(details).length > 0 ? details : undefined,
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));
      setActivitySummary("");
      setActivityDetails("");
      setActivityOpportunity("");
      setActivityNextStep("");
      setActivityFollowUpDate("");
      await refreshWithMessage("Activity logged.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setActivityBusy(false);
    }
  }

  async function createTask() {
    if (!taskTitle.trim()) {
      setError("Enter a task title first.");
      return;
    }

    setTaskBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/workspace/sources/${props.sourceId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskTitle,
          due_date: taskDueDate || null,
          assigned_user_id: taskAssignedUserId || null,
          priority: taskPriority ? Number(taskPriority) : null,
        }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(String(json.error || `Save failed (${res.status})`));
      setTaskTitle("");
      setTaskDueDate("");
      setTaskPriority("2");
      await refreshWithMessage("Task created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setTaskBusy(false);
    }
  }

  function applyActivityPrompt(prompt: (typeof ACTIVITY_PROMPTS)[number]) {
    setActivityType(prompt.activityType);
    setActivitySummary(prompt.summary);
    setActivityDetails(prompt.details);
    setActivityOpportunity("");
    setActivityNextStep("");
    setActivityFollowUpDate("");
  }

  return (
    <div className="space-y-3">
      {error ? <p className="rounded-xl border border-[#f1d1d1] bg-[#fff5f5] px-3 py-2 text-sm text-[#991b1b]">{error}</p> : null}
      {success ? <p className="rounded-xl border border-[#bfe8df] bg-[#effcf8] px-3 py-2 text-sm text-[#0f766e]">{success}</p> : null}

      <section id="source-log-activity" className={sectionClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#173543]">Log Sourcing Activity</h2>
            <p className="mt-1 text-sm text-[#5c7483]">Capture supplier conversations, cannabinoid leads, pricing movement, and the next concrete step from the account page.</p>
          </div>
          <button
            type="button"
            onClick={() => void createActivity()}
            disabled={activityBusy}
            className="rounded-full bg-[#14b8a6] px-3.5 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {activityBusy ? "Saving..." : "Log Activity"}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {ACTIVITY_PROMPTS.map((prompt) => (
            <button key={prompt.label} type="button" onClick={() => applyActivityPrompt(prompt)} className={sourcingPromptClass}>
              {prompt.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Activity Type</span>
            <select value={activityType} onChange={(event) => setActivityType(event.target.value)} className={inputClass}>
              {["touchpoint", "qualification", "sample_review", "price_update", "product_match", "meeting", "note"].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Summary</span>
            <input value={activitySummary} onChange={(event) => setActivitySummary(event.target.value)} className={inputClass} placeholder="Supplier can support CBC isolate lead with updated MOQ next week." />
          </label>
          <label className="grid gap-1 text-sm text-[#4a6575] xl:col-span-2">
            <span>Conversation / Opportunity Notes</span>
            <textarea
              value={activityDetails}
              onChange={(event) => setActivityDetails(event.target.value)}
              rows={4}
              className={inputClass}
              placeholder="Capture pricing context, quality read, lead quality, contacts, and what was learned."
            />
          </label>
          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Cannabinoid / Product Opportunity</span>
            <input
              value={activityOpportunity}
              onChange={(event) => setActivityOpportunity(event.target.value)}
              className={inputClass}
              placeholder="CBC distillate, CBG flower, THCV gummy input, rare isolate lead"
            />
          </label>
          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Next Step</span>
            <input
              value={activityNextStep}
              onChange={(event) => setActivityNextStep(event.target.value)}
              className={inputClass}
              placeholder="Request spec sheet and COAs, then review pricing on Friday."
            />
          </label>
          <label className="grid gap-1 text-sm text-[#4a6575] xl:max-w-[220px]">
            <span>Next Follow-Up</span>
            <input type="date" value={activityFollowUpDate} onChange={(event) => setActivityFollowUpDate(event.target.value)} className={inputClass} />
          </label>
        </div>
      </section>

      <section id="source-create-task" className={sectionClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#173543]">Create Follow-Up</h2>
            <p className="mt-1 text-sm text-[#5c7483]">Turn the sourcing note into an explicit owner, due date, and next action without leaving the account.</p>
          </div>
          <button
            type="button"
            onClick={() => void createTask()}
            disabled={taskBusy}
            className="rounded-full bg-[#173543] px-3.5 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {taskBusy ? "Saving..." : "Create Task"}
          </button>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_180px_220px_140px]">
          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Task Title</span>
            <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} className={inputClass} placeholder="Request updated CBC pricing sheet and COAs." />
          </label>
          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Due Date</span>
            <input type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} className={inputClass} />
          </label>
          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Assigned Buyer</span>
            <select value={taskAssignedUserId} onChange={(event) => setTaskAssignedUserId(event.target.value)} className={inputClass}>
              <option value="">Unassigned</option>
              {props.staffOptions.map((option) => (
                <option key={option.userId} value={option.userId}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Priority</span>
            <select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value)} className={inputClass}>
              {["1", "2", "3", "4", "5"].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section id="source-profile" className={sectionClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#173543]">Source Profile</h2>
            <p className="mt-1 text-sm text-[#5c7483]">Keep supplier profile, contact data, stage, and evergreen sourcing notes current.</p>
          </div>
          <button
            type="button"
            onClick={() => void saveProfile()}
            disabled={profileBusy}
            className="rounded-full border border-[#d0dde5] bg-white px-3.5 py-1.5 text-sm font-semibold text-[#173543] disabled:opacity-60"
          >
            {profileBusy ? "Saving..." : "Save Profile"}
          </button>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
          </label>
          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Source Type</span>
            <input value={sourceType} onChange={(event) => setSourceType(event.target.value)} className={inputClass} placeholder="manufacturer, farm, broker" />
          </label>
          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Company Name</span>
            <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} className={inputClass} />
          </label>
          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Contact Name</span>
            <input value={contactName} onChange={(event) => setContactName(event.target.value)} className={inputClass} />
          </label>
          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Contact Email</span>
            <input value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} className={inputClass} />
          </label>
          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Contact Phone</span>
            <input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} className={inputClass} />
          </label>
          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className={inputClass}>
              {["active", "prospect", "lead", "on_hold", "inactive"].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-[#4a6575]">
            <span>Stage</span>
            <select value={stage} onChange={(event) => setStage(event.target.value)} className={inputClass}>
              {["new", "qualified", "active", "paused", "closed"].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-[#4a6575] lg:col-span-2">
            <span>Working Notes</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={5} className={inputClass} placeholder="Preferred cultivars, buyer read, compliance caveats, supply strengths, or relationship notes." />
          </label>
        </div>
      </section>
    </div>
  );
}
