import { redirect } from "next/navigation";
import { safeInternalReturnTo } from "@/lib/auth/canAccessEstimator";
import { createClient } from "@/lib/supabase/server";
import EstimatePrintClient from "./print-client";

type PrintPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EstimatePrintPage({ params }: PrintPageProps) {
  const { id: rawId } = await params;
  const id = String(rawId || "").trim();
  if (!id) {
    redirect("/estimate");
  }

  const returnTo = safeInternalReturnTo(`/estimate/${id}/print`);
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData?.user ?? null;

  if (authError) {
    console.error("[estimate/print/page] auth lookup failed", {
      estimate_id: id,
      return_to: returnTo,
      message: authError.message,
    });
  }

  if (!user) {
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  return <EstimatePrintClient estimateId={id} />;
}
