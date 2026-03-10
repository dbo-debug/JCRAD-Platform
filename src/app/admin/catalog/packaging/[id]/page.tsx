import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminCatalogPackagingDetailPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/admin/catalog/packaging/${id}/edit`);
}
