import { POST as updatePost } from "@/app/api/variant-media/update/route";

export async function POST(req: Request) {
  console.log("[api/admin/variant-media/update] POST hit");
  return updatePost(req);
}