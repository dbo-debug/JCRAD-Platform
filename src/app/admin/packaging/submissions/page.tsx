import { requireAdmin } from "@/lib/requireAdmin";
import PackagingSubmissionsAdminClient from "./submissions-admin-client";

export default async function AdminPackagingSubmissionsPage() {
  await requireAdmin();
  return <PackagingSubmissionsAdminClient />;
}
