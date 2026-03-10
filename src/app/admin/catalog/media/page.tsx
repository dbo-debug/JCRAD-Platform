import { requireAdmin } from "@/lib/requireAdmin";
import ProductsAdminClient from "../products/products-admin-client";

export default async function AdminCatalogMediaPage(props: {
  searchParams?: Record<string, string | string[] | undefined> | Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  await Promise.resolve(props.searchParams ?? {});

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
        Catalog Product Media
      </h1>
      <p style={{ opacity: 0.8, marginTop: 0 }}>
        Product media is managed on the Products admin page with a dropdown selector.
      </p>
      <ProductsAdminClient />
    </div>
  );
}
