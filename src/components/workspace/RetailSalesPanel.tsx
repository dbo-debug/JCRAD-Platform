"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { RetailSalesAccountData } from "@/lib/retailSalesWorkspace";
import {
  ACCOUNT_OWNERSHIP_OPTIONS,
  OPPORTUNITY_STAGE_OPTIONS,
  PRODUCT_INTEREST_OPTIONS,
} from "@/lib/namelessWorkspace";

type ContactOption = { id: string; name: string; email: string | null; title: string | null };

const inputClass =
  "min-h-11 w-full rounded-xl border border-[#d6e4ea] bg-white px-3 py-2.5 text-sm text-[#173543] outline-none focus:border-[#0d6f7a] focus:ring-2 focus:ring-[#0d6f7a]/15";
const cardClass = "rounded-[24px] border border-[#d8e6ed] bg-white p-4 shadow-sm sm:p-5";

function labelize(value: unknown) {
  return String(value || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function text(row: Record<string, unknown>, key: string) {
  const value = String(row[key] || "").trim();
  return value || null;
}

function currency(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? amount.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    : "$0.00";
}

export default function RetailSalesPanel({
  customerId,
  contacts,
  data,
  canVerifyOwnership,
}: {
  customerId: string;
  contacts: ContactOption[];
  data: RetailSalesAccountData;
  canVerifyOwnership: boolean;
}) {
  const router = useRouter();
  const endpoint = `/api/workspace/retail/accounts/${encodeURIComponent(customerId)}/sales`;
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState({
    dbaName: data.account.dbaName || "",
    legalBusinessName: data.account.legalBusinessName || "",
    licenseNumber: data.account.licenseNumber || "",
    licenseType: data.account.licenseType || "",
    licenseStatus: data.account.licenseStatus || "",
    instagram: data.account.instagram || "",
    distributor: data.account.distributor || "",
    numberOfLocations: String(data.account.numberOfLocations),
    currentBrands: data.account.currentBrandsCarried.join(", "),
    leadSource: data.account.leadSource || "",
  });
  const [ownership, setOwnership] = useState({
    status: data.account.ownershipStatus,
    notes: data.account.ownershipNotes || "",
    eligible: data.account.commissionEligible,
    rate: String(data.account.commissionRate * 100),
    startDate: data.account.commissionStartDate || "",
    expirationDate: data.account.commissionExpirationDate || "",
    markVerified: false,
  });
  const [opportunity, setOpportunity] = useState({
    name: "",
    contactId: contacts[0]?.id || "",
    stage: "new_prospect",
    estimatedValue: "",
    probability: "25",
    expectedCloseDate: "",
    products: [] as string[],
    sampleStatus: "",
    pricingStatus: "",
    nextAction: "",
    nextActionDueDate: "",
    leadSource: data.account.leadSource || "",
    notes: "",
  });
  const [activity, setActivity] = useState({
    type: "store_visit",
    contactId: contacts[0]?.id || "",
    opportunityId: "",
    notes: "",
    outcome: "",
    nextAction: "",
    nextActionDate: "",
    createTask: true,
  });
  const [sample, setSample] = useState({
    contactId: contacts[0]?.id || "",
    opportunityId: "",
    requestedAt: new Date().toISOString().slice(0, 10),
    approvalStatus: "pending",
    products: "",
    quantity: "",
    preparedAt: "",
    deliveredAt: "",
    recipient: "",
    followUpDate: "",
    outcome: "pending",
    feedback: "",
    feedbackAt: "",
    notes: "",
  });
  const [order, setOrder] = useState({
    opportunityId: "",
    orderNumber: "",
    invoiceNumber: "",
    orderDate: new Date().toISOString().slice(0, 10),
    invoiceDate: "",
    grossSales: "",
    discounts: "0",
    returnsCredits: "0",
    commissionRate: String(data.account.commissionRate * 100),
    paymentStatus: "uncollected",
    approvalStatus: "pending",
    commissionPaymentStatus: "unpaid",
    commissionStatus: "estimated",
    commissionPaidAt: "",
    notes: "",
  });

  async function submit(action: string, payload: Record<string, unknown>, success: string) {
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(json.error || `${success} failed.`));
      setMessage(success);
      router.refresh();
      return true;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : `${success} failed.`);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function saveOwnership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submit(
      "update_ownership",
      {
        ownership_status: ownership.status,
        ownership_notes: ownership.notes,
        commission_eligible: ownership.eligible,
        commission_rate: Number(ownership.rate) / 100,
        commission_start_date: ownership.startDate || null,
        commission_expiration_date: ownership.expirationDate || null,
        mark_verified: ownership.markVerified,
      },
      "Ownership and commission settings saved."
    );
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submit(
      "update_profile",
      {
        dba_name: profile.dbaName,
        legal_business_name: profile.legalBusinessName,
        license_number: profile.licenseNumber,
        license_type: profile.licenseType,
        license_status: profile.licenseStatus,
        instagram: profile.instagram,
        distributor: profile.distributor,
        number_of_locations: profile.numberOfLocations,
        current_brands_carried: profile.currentBrands.split(",").map((value) => value.trim()).filter(Boolean),
        lead_source: profile.leadSource,
      },
      "Retail account profile saved."
    );
  }

  async function createOpportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await submit(
      "create_opportunity",
      {
        name: opportunity.name,
        contact_id: opportunity.contactId || null,
        stage: opportunity.stage,
        estimated_order_value: opportunity.estimatedValue || null,
        probability: opportunity.probability || null,
        expected_close_date: opportunity.expectedCloseDate || null,
        products_of_interest: opportunity.products,
        sample_status: opportunity.sampleStatus || null,
        pricing_status: opportunity.pricingStatus || null,
        next_action: opportunity.nextAction || null,
        next_action_due_date: opportunity.nextActionDueDate || null,
        lead_source: opportunity.leadSource || null,
        notes: opportunity.notes || null,
      },
      "Opportunity created."
    );
    if (ok) setOpportunity((current) => ({ ...current, name: "", estimatedValue: "", notes: "", nextAction: "" }));
  }

  async function createActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await submit(
      "create_activity",
      {
        activity_type: activity.type,
        summary: labelize(activity.type),
        contact_id: activity.contactId || null,
        opportunity_id: activity.opportunityId || null,
        notes: activity.notes,
        outcome: activity.outcome || null,
        next_action: activity.nextAction || null,
        next_action_date: activity.nextActionDate || null,
        create_task: activity.createTask,
      },
      "Activity logged."
    );
    if (ok) setActivity((current) => ({ ...current, notes: "", outcome: "", nextAction: "" }));
  }

  async function createSample(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await submit(
      "create_sample",
      {
        contact_id: sample.contactId || null,
        opportunity_id: sample.opportunityId || null,
        requested_at: sample.requestedAt || null,
        approval_status: sample.approvalStatus,
        products_requested: sample.products.split(",").map((value) => value.trim()).filter(Boolean),
        quantity: sample.quantity || null,
        prepared_at: sample.preparedAt || null,
        delivered_at: sample.deliveredAt || null,
        recipient: sample.recipient || null,
        buyer_feedback: sample.feedback || null,
        feedback_at: sample.feedbackAt || null,
        follow_up_date: sample.followUpDate || null,
        outcome: sample.outcome,
        notes: sample.notes || null,
      },
      sample.deliveredAt ? "Sample delivery recorded." : "Sample request recorded."
    );
    if (ok) setSample((current) => ({ ...current, products: "", quantity: "", feedback: "", notes: "" }));
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await submit(
      "create_order",
      {
        opportunity_id: order.opportunityId || null,
        order_number: order.orderNumber || null,
        invoice_number: order.invoiceNumber || null,
        order_date: order.orderDate,
        invoice_date: order.invoiceDate || null,
        gross_sales: order.grossSales,
        discounts: order.discounts,
        returns_credits: order.returnsCredits,
        commission_rate: Number(order.commissionRate) / 100,
        payment_collection_status: order.paymentStatus,
        commission_approval_status: order.approvalStatus,
        commission_payment_status: order.commissionPaymentStatus,
        commission_status: order.commissionStatus,
        commission_paid_at: order.commissionPaidAt || null,
        notes: order.notes || null,
      },
      "Order and estimated commission recorded."
    );
    if (ok) setOrder((current) => ({ ...current, orderNumber: "", invoiceNumber: "", grossSales: "", notes: "" }));
  }

  return (
    <section id="nameless-sales-workspace" className="scroll-mt-24 space-y-5">
      <div className="rounded-[28px] border border-[#bfe8df] bg-[linear-gradient(135deg,#effcf8_0%,#ffffff_70%)] p-5 shadow-sm sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0d6f7a]">Nameless Genetics Retail Sales</p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-[#173543]">Account sales workspace</h2>
            <p className="mt-1 text-sm text-[#5c7483]">Opportunities, buyer activity, samples, orders, and estimated commission stay attached to this retail account.</p>
          </div>
          <span className="rounded-full border border-[#bfe8df] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#0d6f7a]">
            {labelize(data.account.ownershipStatus)}
          </span>
        </div>
      </div>

      {error ? <p role="alert" className="rounded-xl border border-[#f1d1d1] bg-[#fff5f5] px-4 py-3 text-sm text-[#991b1b]">{error}</p> : null}
      {message ? <p className="rounded-xl border border-[#bfe8df] bg-[#effcf8] px-4 py-3 text-sm text-[#0d6f7a]">{message}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Commissionable this month" value={currency(data.commission.commissionableSalesThisMonth)} />
        <Metric label="Estimated this month" value={currency(data.commission.estimatedCommissionThisMonth)} helper="Not guaranteed income" />
        <Metric label="Approved unpaid" value={currency(data.commission.approvedUnpaidCommission)} />
        <Metric label="Paid commission" value={currency(data.commission.paidCommission)} />
      </div>

      <details className={cardClass}>
        <summary className="cursor-pointer text-lg font-semibold text-[#173543]">Retail account profile</summary>
        <form onSubmit={saveProfile} className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="DBA / store name"><input required value={profile.dbaName} onChange={(e) => setProfile((current) => ({ ...current, dbaName: e.target.value }))} className={inputClass} /></Field>
          <Field label="Legal business name"><input value={profile.legalBusinessName} onChange={(e) => setProfile((current) => ({ ...current, legalBusinessName: e.target.value }))} className={inputClass} /></Field>
          <Field label="License number"><input value={profile.licenseNumber} onChange={(e) => setProfile((current) => ({ ...current, licenseNumber: e.target.value }))} className={inputClass} /></Field>
          <Field label="License type"><input value={profile.licenseType} onChange={(e) => setProfile((current) => ({ ...current, licenseType: e.target.value }))} className={inputClass} /></Field>
          <Field label="License status"><input value={profile.licenseStatus} onChange={(e) => setProfile((current) => ({ ...current, licenseStatus: e.target.value }))} className={inputClass} /></Field>
          <Field label="Instagram"><input value={profile.instagram} onChange={(e) => setProfile((current) => ({ ...current, instagram: e.target.value }))} className={inputClass} /></Field>
          <Field label="Distributor"><input value={profile.distributor} onChange={(e) => setProfile((current) => ({ ...current, distributor: e.target.value }))} className={inputClass} /></Field>
          <Field label="Number of locations"><input type="number" min="1" value={profile.numberOfLocations} onChange={(e) => setProfile((current) => ({ ...current, numberOfLocations: e.target.value }))} className={inputClass} /></Field>
          <Field label="Current brands carried" className="md:col-span-2"><input value={profile.currentBrands} onChange={(e) => setProfile((current) => ({ ...current, currentBrands: e.target.value }))} placeholder="Comma separated" className={inputClass} /></Field>
          <Field label="Lead source" className="md:col-span-2"><input value={profile.leadSource} onChange={(e) => setProfile((current) => ({ ...current, leadSource: e.target.value }))} className={inputClass} /></Field>
          <button disabled={busy !== null} className="min-h-12 rounded-full bg-[#173543] px-5 py-3 font-semibold text-white disabled:opacity-50 md:col-span-2">{busy === "update_profile" ? "Saving..." : "Save Retail Profile"}</button>
        </form>
      </details>

      <details className={cardClass} open>
        <summary className="cursor-pointer text-lg font-semibold text-[#173543]">Ownership and commission protection</summary>
        <form onSubmit={saveOwnership} className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Ownership status"><select value={ownership.status} onChange={(e) => setOwnership((current) => ({ ...current, status: e.target.value }))} className={inputClass}>{ACCOUNT_OWNERSHIP_OPTIONS.map((option) => <option key={option} value={option}>{labelize(option)}</option>)}</select></Field>
          <Field label="Commission rate"><div className="relative"><input type="number" min="0" max="100" step="0.01" value={ownership.rate} disabled={!canVerifyOwnership} onChange={(e) => setOwnership((current) => ({ ...current, rate: e.target.value }))} className={inputClass} /><span className="absolute right-3 top-3 text-sm text-[#5c7483]">%</span></div></Field>
          <Field label="Commission start"><input type="date" value={ownership.startDate} onChange={(e) => setOwnership((current) => ({ ...current, startDate: e.target.value }))} className={inputClass} /></Field>
          <Field label="Commission expiration"><input type="date" value={ownership.expirationDate} onChange={(e) => setOwnership((current) => ({ ...current, expirationDate: e.target.value }))} className={inputClass} /></Field>
          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-[#d6e4ea] px-3 text-sm text-[#355160]"><input type="checkbox" checked={ownership.eligible} onChange={(e) => setOwnership((current) => ({ ...current, eligible: e.target.checked }))} className="h-5 w-5" />Eligible for commission</label>
          {canVerifyOwnership ? <label className="flex min-h-11 items-center gap-3 rounded-xl border border-[#d6e4ea] px-3 text-sm text-[#355160]"><input type="checkbox" checked={ownership.markVerified} onChange={(e) => setOwnership((current) => ({ ...current, markVerified: e.target.checked }))} className="h-5 w-5" />Verify ownership now</label> : null}
          <Field label="Ownership notes" className="md:col-span-2"><textarea rows={3} value={ownership.notes} onChange={(e) => setOwnership((current) => ({ ...current, notes: e.target.value }))} className={inputClass} /></Field>
          <button disabled={busy !== null} className="min-h-12 rounded-full bg-[#173543] px-5 py-3 font-semibold text-white disabled:opacity-50 md:col-span-2">{busy === "update_ownership" ? "Saving..." : "Save Ownership"}</button>
        </form>
      </details>

      <div className="grid gap-5 2xl:grid-cols-2">
        <details id="nameless-opportunity" className={`${cardClass} scroll-mt-24`} open>
          <summary className="cursor-pointer text-lg font-semibold text-[#173543]">Create opportunity</summary>
          <form onSubmit={createOpportunity} className="mt-5 grid gap-3 sm:grid-cols-2">
            <Field label="Opportunity name" className="sm:col-span-2"><input required value={opportunity.name} onChange={(e) => setOpportunity((current) => ({ ...current, name: e.target.value }))} className={inputClass} /></Field>
            <ContactSelect contacts={contacts} value={opportunity.contactId} onChange={(value) => setOpportunity((current) => ({ ...current, contactId: value }))} />
            <Field label="Stage"><select value={opportunity.stage} onChange={(e) => setOpportunity((current) => ({ ...current, stage: e.target.value }))} className={inputClass}>{OPPORTUNITY_STAGE_OPTIONS.map((stage) => <option key={stage} value={stage}>{labelize(stage)}</option>)}</select></Field>
            <Field label="Estimated order value"><input type="number" min="0" step="0.01" value={opportunity.estimatedValue} onChange={(e) => setOpportunity((current) => ({ ...current, estimatedValue: e.target.value }))} className={inputClass} /></Field>
            <Field label="Probability %"><input type="number" min="0" max="100" value={opportunity.probability} onChange={(e) => setOpportunity((current) => ({ ...current, probability: e.target.value }))} className={inputClass} /></Field>
            <Field label="Expected close"><input type="date" value={opportunity.expectedCloseDate} onChange={(e) => setOpportunity((current) => ({ ...current, expectedCloseDate: e.target.value }))} className={inputClass} /></Field>
            <Field label="Next action due"><input type="date" value={opportunity.nextActionDueDate} onChange={(e) => setOpportunity((current) => ({ ...current, nextActionDueDate: e.target.value }))} className={inputClass} /></Field>
            <Field label="Next action" className="sm:col-span-2"><input value={opportunity.nextAction} onChange={(e) => setOpportunity((current) => ({ ...current, nextAction: e.target.value }))} className={inputClass} /></Field>
            <fieldset className="sm:col-span-2"><legend className="text-sm font-semibold text-[#355160]">Product interest</legend><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{PRODUCT_INTEREST_OPTIONS.map((product) => <label key={product} className="flex min-h-11 items-center gap-2 rounded-xl border border-[#d6e4ea] px-3 text-sm"><input type="checkbox" checked={opportunity.products.includes(product)} onChange={() => setOpportunity((current) => ({ ...current, products: current.products.includes(product) ? current.products.filter((item) => item !== product) : [...current.products, product] }))} className="h-4 w-4" />{product}</label>)}</div></fieldset>
            <Field label="Notes" className="sm:col-span-2"><textarea rows={3} value={opportunity.notes} onChange={(e) => setOpportunity((current) => ({ ...current, notes: e.target.value }))} className={inputClass} /></Field>
            <button disabled={busy !== null} className="min-h-12 rounded-full bg-[#0d6f7a] px-5 py-3 font-semibold text-white disabled:opacity-50 sm:col-span-2">{busy === "create_opportunity" ? "Creating..." : "Create Opportunity"}</button>
          </form>
        </details>

        <div className={cardClass}>
          <h3 className="text-lg font-semibold text-[#173543]">Opportunities</h3>
          <div className="mt-4 space-y-3">
            {data.opportunities.map((item) => (
              <OpportunityCard key={String(item.id)} item={item} busy={busy} onAdvance={(stage, lostReason) => submit("advance_opportunity", { opportunity_id: item.id, stage, lost_reason: lostReason || null }, "Opportunity advanced.")} />
            ))}
            {data.opportunities.length === 0 ? <Empty label="No opportunities yet." /> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-5 2xl:grid-cols-2">
        <details id="nameless-activity" className={`${cardClass} scroll-mt-24`} open>
          <summary className="cursor-pointer text-lg font-semibold text-[#173543]">Log activity or meeting</summary>
          <form onSubmit={createActivity} className="mt-5 grid gap-3 sm:grid-cols-2">
            <Field label="Activity type"><select value={activity.type} onChange={(e) => setActivity((current) => ({ ...current, type: e.target.value }))} className={inputClass}>{["call","text","email","store_visit","meeting","sample_drop","buyer_feedback","pricing_sent","order_update","internal_note"].map((option) => <option key={option} value={option}>{labelize(option)}</option>)}</select></Field>
            <ContactSelect contacts={contacts} value={activity.contactId} onChange={(value) => setActivity((current) => ({ ...current, contactId: value }))} />
            <OpportunitySelect opportunities={data.opportunities} value={activity.opportunityId} onChange={(value) => setActivity((current) => ({ ...current, opportunityId: value }))} />
            <Field label="Outcome"><input value={activity.outcome} onChange={(e) => setActivity((current) => ({ ...current, outcome: e.target.value }))} className={inputClass} /></Field>
            <Field label="Notes" className="sm:col-span-2"><textarea required rows={4} value={activity.notes} onChange={(e) => setActivity((current) => ({ ...current, notes: e.target.value }))} className={inputClass} /></Field>
            <Field label="Next action"><input value={activity.nextAction} onChange={(e) => setActivity((current) => ({ ...current, nextAction: e.target.value }))} className={inputClass} /></Field>
            <Field label="Next-action date"><input type="date" value={activity.nextActionDate} onChange={(e) => setActivity((current) => ({ ...current, nextActionDate: e.target.value }))} className={inputClass} /></Field>
            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-[#d6e4ea] px-3 text-sm sm:col-span-2"><input type="checkbox" checked={activity.createTask} onChange={(e) => setActivity((current) => ({ ...current, createTask: e.target.checked }))} className="h-5 w-5" />Create a follow-up task from the next action</label>
            <button disabled={busy !== null} className="min-h-12 rounded-full bg-[#173543] px-5 py-3 font-semibold text-white disabled:opacity-50 sm:col-span-2">{busy === "create_activity" ? "Saving..." : "Log Activity"}</button>
          </form>
        </details>

        <details id="nameless-samples" className={`${cardClass} scroll-mt-24`} open>
          <summary className="cursor-pointer text-lg font-semibold text-[#173543]">Record samples</summary>
          <form onSubmit={createSample} className="mt-5 grid gap-3 sm:grid-cols-2">
            <ContactSelect contacts={contacts} value={sample.contactId} onChange={(value) => setSample((current) => ({ ...current, contactId: value }))} />
            <OpportunitySelect opportunities={data.opportunities} value={sample.opportunityId} onChange={(value) => setSample((current) => ({ ...current, opportunityId: value }))} />
            <Field label="Request date"><input type="date" value={sample.requestedAt} onChange={(e) => setSample((current) => ({ ...current, requestedAt: e.target.value }))} className={inputClass} /></Field>
            <Field label="Approval status"><select value={sample.approvalStatus} onChange={(e) => setSample((current) => ({ ...current, approvalStatus: e.target.value }))} className={inputClass}><option value="pending">Pending</option><option value="approved">Approved</option><option value="declined">Declined</option></select></Field>
            <Field label="Products requested"><input required value={sample.products} onChange={(e) => setSample((current) => ({ ...current, products: e.target.value }))} placeholder="Comma separated" className={inputClass} /></Field>
            <Field label="Quantity"><input value={sample.quantity} onChange={(e) => setSample((current) => ({ ...current, quantity: e.target.value }))} className={inputClass} /></Field>
            <Field label="Prepared date"><input type="date" value={sample.preparedAt} onChange={(e) => setSample((current) => ({ ...current, preparedAt: e.target.value }))} className={inputClass} /></Field>
            <Field label="Delivery date"><input type="date" value={sample.deliveredAt} onChange={(e) => setSample((current) => ({ ...current, deliveredAt: e.target.value }))} className={inputClass} /></Field>
            <Field label="Recipient"><input value={sample.recipient} onChange={(e) => setSample((current) => ({ ...current, recipient: e.target.value }))} className={inputClass} /></Field>
            <Field label="Feedback date"><input type="date" value={sample.feedbackAt} onChange={(e) => setSample((current) => ({ ...current, feedbackAt: e.target.value }))} className={inputClass} /></Field>
            <Field label="Follow-up date"><input type="date" value={sample.followUpDate} onChange={(e) => setSample((current) => ({ ...current, followUpDate: e.target.value }))} className={inputClass} /></Field>
            <Field label="Outcome"><select value={sample.outcome} onChange={(e) => setSample((current) => ({ ...current, outcome: e.target.value }))} className={inputClass}>{["pending","positive","neutral","negative","more_samples_requested","pricing_requested","order_expected","no_response"].map((option) => <option key={option} value={option}>{labelize(option)}</option>)}</select></Field>
            <Field label="Buyer feedback" className="sm:col-span-2"><textarea rows={3} value={sample.feedback} onChange={(e) => setSample((current) => ({ ...current, feedback: e.target.value }))} className={inputClass} /></Field>
            <button disabled={busy !== null} className="min-h-12 rounded-full bg-[#0d6f7a] px-5 py-3 font-semibold text-white disabled:opacity-50 sm:col-span-2">{busy === "create_sample" ? "Saving..." : sample.deliveredAt ? "Record Sample Drop" : "Record Sample Request"}</button>
          </form>
        </details>
      </div>

      <div className="grid gap-5 2xl:grid-cols-2">
        <details className={cardClass} open>
          <summary className="cursor-pointer text-lg font-semibold text-[#173543]">Record order and estimated commission</summary>
          <p className="mt-2 text-sm text-[#9a6b00]">Commission is an operational estimate and is not guaranteed income.</p>
          <form onSubmit={createOrder} className="mt-5 grid gap-3 sm:grid-cols-2">
            <OpportunitySelect opportunities={data.opportunities} value={order.opportunityId} onChange={(value) => setOrder((current) => ({ ...current, opportunityId: value }))} />
            <Field label="Order date"><input type="date" required value={order.orderDate} onChange={(e) => setOrder((current) => ({ ...current, orderDate: e.target.value }))} className={inputClass} /></Field>
            <Field label="Order number"><input value={order.orderNumber} onChange={(e) => setOrder((current) => ({ ...current, orderNumber: e.target.value }))} className={inputClass} /></Field>
            <Field label="Invoice number"><input value={order.invoiceNumber} onChange={(e) => setOrder((current) => ({ ...current, invoiceNumber: e.target.value }))} className={inputClass} /></Field>
            <Field label="Invoice date"><input type="date" value={order.invoiceDate} onChange={(e) => setOrder((current) => ({ ...current, invoiceDate: e.target.value }))} className={inputClass} /></Field>
            <Field label="Gross sales"><input type="number" min="0" step="0.01" required value={order.grossSales} onChange={(e) => setOrder((current) => ({ ...current, grossSales: e.target.value }))} className={inputClass} /></Field>
            <Field label="Discounts"><input type="number" min="0" step="0.01" value={order.discounts} onChange={(e) => setOrder((current) => ({ ...current, discounts: e.target.value }))} className={inputClass} /></Field>
            <Field label="Returns / credits"><input type="number" min="0" step="0.01" value={order.returnsCredits} onChange={(e) => setOrder((current) => ({ ...current, returnsCredits: e.target.value }))} className={inputClass} /></Field>
            <Field label="Commission rate"><div className="relative"><input type="number" value={order.commissionRate} disabled={!canVerifyOwnership} onChange={(e) => setOrder((current) => ({ ...current, commissionRate: e.target.value }))} className={inputClass} /><span className="absolute right-3 top-3 text-sm text-[#5c7483]">%</span></div></Field>
            <Field label="Customer payment"><select value={order.paymentStatus} onChange={(e) => setOrder((current) => ({ ...current, paymentStatus: e.target.value }))} className={inputClass}><option value="uncollected">Uncollected</option><option value="partial">Partial</option><option value="collected">Collected</option></select></Field>
            <Field label="Commission approval"><select value={order.approvalStatus} onChange={(e) => setOrder((current) => ({ ...current, approvalStatus: e.target.value }))} className={inputClass}><option value="pending">Pending</option><option value="approved">Approved</option><option value="disputed">Disputed</option><option value="not_eligible">Not eligible</option></select></Field>
            <Field label="Commission payment"><select value={order.commissionPaymentStatus} onChange={(e) => setOrder((current) => ({ ...current, commissionPaymentStatus: e.target.value }))} className={inputClass}><option value="unpaid">Unpaid</option><option value="scheduled">Scheduled</option><option value="paid">Paid</option></select></Field>
            <Field label="Commission status"><select value={order.commissionStatus} onChange={(e) => setOrder((current) => ({ ...current, commissionStatus: e.target.value }))} className={inputClass}>{["estimated","awaiting_invoice","awaiting_customer_payment","eligible","approved","paid","disputed","not_eligible"].map((option) => <option key={option} value={option}>{labelize(option)}</option>)}</select></Field>
            <Field label="Commission paid date"><input type="date" value={order.commissionPaidAt} onChange={(e) => setOrder((current) => ({ ...current, commissionPaidAt: e.target.value }))} className={inputClass} /></Field>
            <Field label="Notes" className="sm:col-span-2"><textarea rows={3} value={order.notes} onChange={(e) => setOrder((current) => ({ ...current, notes: e.target.value }))} className={inputClass} /></Field>
            <button disabled={busy !== null} className="min-h-12 rounded-full bg-[#173543] px-5 py-3 font-semibold text-white disabled:opacity-50 sm:col-span-2">{busy === "create_order" ? "Calculating..." : "Record Order & Commission"}</button>
          </form>
        </details>

        <div className={cardClass}>
          <h3 className="text-lg font-semibold text-[#173543]">Orders and commission</h3>
          <div className="mt-4 space-y-3">
            {data.orders.map((item) => <div key={String(item.id)} className="rounded-2xl border border-[#d8e6ed] bg-[#f7fbfc] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-[#173543]">{text(item, "order_number") || `Order ${String(item.id).slice(0, 8)}`}</p><span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold uppercase text-[#0d6f7a]">{labelize(item.commission_status)}</span></div><p className="mt-2 text-sm text-[#4f6877]">Commissionable {currency(item.commissionable_sales)} • Estimated commission {currency(item.estimated_commission)}</p><p className="mt-1 text-xs text-[#9a6b00]">Estimate only; not guaranteed income.</p></div>)}
            {data.orders.length === 0 ? <Empty label="No retail orders yet." /> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function OpportunityCard({ item, busy, onAdvance }: { item: Record<string, unknown>; busy: string | null; onAdvance: (stage: string, lostReason: string) => Promise<boolean> }) {
  const [stage, setStage] = useState(String(item.stage || "new_prospect"));
  const [lostReason, setLostReason] = useState(String(item.lost_reason || ""));
  return <div className="rounded-2xl border border-[#d8e6ed] bg-[#f7fbfc] p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold text-[#173543]">{text(item, "name")}</p><p className="mt-1 text-sm text-[#5c7483]">{currency(item.estimated_order_value)} • {Number(item.probability || 0)}% probability</p></div><span className="rounded-full border border-[#bfe8df] bg-white px-2.5 py-1 text-xs font-semibold uppercase text-[#0d6f7a]">{labelize(item.stage)}</span></div><div className="mt-3 flex flex-col gap-2 sm:flex-row"><select value={stage} onChange={(e) => setStage(e.target.value)} className={inputClass}>{OPPORTUNITY_STAGE_OPTIONS.map((option) => <option key={option} value={option}>{labelize(option)}</option>)}</select><button type="button" disabled={busy !== null || stage === item.stage} onClick={() => void onAdvance(stage, lostReason)} className="min-h-11 shrink-0 rounded-full border border-[#0d6f7a] bg-white px-4 text-sm font-semibold text-[#0d6f7a] disabled:opacity-40">Advance</button></div>{stage === "lost" || stage === "not_qualified" ? <input value={lostReason} onChange={(event) => setLostReason(event.target.value)} placeholder="Lost / not-qualified reason" className={`${inputClass} mt-2`} /> : null}</div>;
}

function ContactSelect({ contacts, value, onChange }: { contacts: ContactOption[]; value: string; onChange: (value: string) => void }) {
  return <Field label="Buyer/contact"><select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}><option value="">No contact selected</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}{contact.title ? ` — ${contact.title}` : ""}</option>)}</select></Field>;
}

function OpportunitySelect({ opportunities, value, onChange }: { opportunities: Record<string, unknown>[]; value: string; onChange: (value: string) => void }) {
  return <Field label="Opportunity"><select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}><option value="">No opportunity selected</option>{opportunities.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name || "Untitled opportunity")}</option>)}</select></Field>;
}

function Metric({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return <div className="rounded-2xl border border-[#d8e6ed] bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6d8593]">{label}</p><p className="mt-2 text-2xl font-semibold text-[#173543]">{value}</p>{helper ? <p className="mt-1 text-xs text-[#9a6b00]">{helper}</p> : null}</div>;
}

function Empty({ label }: { label: string }) {
  return <p className="rounded-xl border border-dashed border-[#d8e6ed] px-4 py-4 text-sm text-[#6d8593]">{label}</p>;
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={["grid gap-1.5 text-sm font-semibold text-[#355160]", className || ""].join(" ")}><span>{label}</span>{children}</label>;
}
