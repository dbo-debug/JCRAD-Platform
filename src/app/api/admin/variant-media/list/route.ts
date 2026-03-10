import { POST as listPost } from "@/app/api/variant-media/list/route";

export async function POST(req: Request) {
  console.log("[api/admin/variant-media/list] POST hit");
  return listPost(req);
}
