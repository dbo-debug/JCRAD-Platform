"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

export default function ForgotPasswordForm() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setSuccess(false);

    const origin = window.location.origin;
    const redirectTo = `${origin}/auth/callback?next=/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });

    setSubmitting(false);
    if (error) {
      setMessage(error.message);
      return;
    }

    setSuccess(true);
    setMessage("Reset instructions sent. Check your email for the secure password reset link.");
  }

  return (
    <div className="flex min-h-[72vh] items-center justify-center">
      <div className="w-full max-w-lg rounded-3xl border border-[#cfe0e8] bg-white p-8 shadow-[0_26px_46px_-32px_rgba(16,24,40,0.45)] md:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0f766e]">Account Recovery</p>
        <h1 className="mt-2 text-3xl font-semibold text-[#13303f]">Reset your password</h1>
        <p className="mt-2 text-sm text-[#4a6575]">Enter your account email and we&apos;ll send reset instructions.</p>

        <form onSubmit={onSubmit}>
          <Input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            className="mt-6"
          />
          <Button
            type="submit"
            fullWidth
            disabled={submitting}
            className="mt-6 rounded-full bg-[#14b8a6] text-white shadow-[0_0_0_1px_rgba(20,184,166,0.24)] hover:bg-[#14b8a6]"
          >
            {submitting ? "Sending..." : "Send reset instructions"}
          </Button>
        </form>

        {message ? (
          <p className={`mt-4 text-sm ${success ? "text-[#0f766e]" : "text-[#9a3d3d]"}`}>{message}</p>
        ) : null}

        <p className="mt-5 text-sm text-[#4a6575]">
          Remembered your password?{" "}
          <Link href="/login" className="font-semibold text-[#0f766e] underline underline-offset-4">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
