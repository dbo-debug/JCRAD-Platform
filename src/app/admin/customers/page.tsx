import AdminPageHeader from "@/components/admin/AdminPageHeader";

const CUSTOMER_TABS = ["Pending Verification", "Approved"] as const;

export default function AdminCustomersPage() {
  return (
    <div>
      <AdminPageHeader
        title="Customers"
        description="Review customer verification and approvals."
        action={
          <button className="rounded bg-[#0FB9B1] px-4 py-2 text-sm font-semibold text-black">
            + Add Customer
          </button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {CUSTOMER_TABS.map((tab, index) => (
          <button
            key={tab}
            className={[
              "rounded border px-3 py-1.5 text-sm",
              index === 0 ? "border-[#0FB9B1] bg-[#0FB9B1]/10 text-[#0FB9B1]" : "border-white/10 text-white/70",
            ].join(" ")}
          >
            {tab}
          </button>
        ))}
      </div>
    </div>
  );
}
