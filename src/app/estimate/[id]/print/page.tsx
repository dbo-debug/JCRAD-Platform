import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth/getUserAndProfile";
import { safeInternalReturnTo } from "@/lib/auth/canAccessEstimator";
import EstimatePrintClient from "./print-client";

type PrintPageProps = {
  params: { id: string };
};

export default async function EstimatePrintPage({ params }: PrintPageProps) {
  const id = String(params.id || "").trim();
  if (!id) {
    redirect("/estimate");
  }

  const returnTo = safeInternalReturnTo(`/estimate/${id}/print`);
  const { user } = await getUserAndProfile();

  if (!user) {
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  return <EstimatePrintClient estimateId={id} />;
}
