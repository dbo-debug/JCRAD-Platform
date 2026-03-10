import { requireAdmin } from "@/lib/requireAdmin";
import OffersAdminClient from "./offers-admin-client";

export default async function AdminOffersPage() {
  await requireAdmin();
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ margin: "24px 24px 0", fontSize: 13, color: "#92400e" }}>
        Deprecated: manage offer settings from Admin Products. This page is kept for backward compatibility.
      </div>
      <OffersAdminClient />
    </div>
  );
}
