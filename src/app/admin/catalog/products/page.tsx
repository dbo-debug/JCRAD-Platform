import { redirect } from "next/navigation";

export default function AdminCatalogProductsRedirectPage() {
  redirect("/admin/catalog/bulk");
}
