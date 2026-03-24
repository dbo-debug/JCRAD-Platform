export const CATALOG_PUBLIC_BUCKET = "catalog-public";
export const CUSTOMER_DOCUMENTS_BUCKET = "customer-documents";

export const PUBLIC_STORAGE_BUCKETS = new Set([CATALOG_PUBLIC_BUCKET]);

export function isPublicStorageBucket(bucket: string | null | undefined): boolean {
  return PUBLIC_STORAGE_BUCKETS.has(String(bucket || "").trim());
}
