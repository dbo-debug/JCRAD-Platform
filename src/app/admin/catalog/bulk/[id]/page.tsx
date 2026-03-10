import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminCatalogBulkDetailPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/admin/catalog/bulk/${id}/edit`);
}
