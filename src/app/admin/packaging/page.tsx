import { requireAdmin } from "@/lib/requireAdmin";
import PackagingAdminClient from "./packaging-admin-client";

export default async function AdminPackagingPage() {
  await requireAdmin();
  return <PackagingAdminClient />;
}
