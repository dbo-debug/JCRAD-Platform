import { POST as deletePost } from "@/app/api/variant-media/delete/route";

export async function POST(req: Request) {
  console.log("[api/admin/variant-media/delete] POST hit");
  return deletePost(req);
}