"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordForm() {
  const supabase = useMemo(() => createClient(), []);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setSuccess(false);

    if (!password) {
      setMessage("Password is required.");
      setSubmitting(false);
      return;
    }
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      setMessage(error.message);
      return;
    }

    setSuccess(true);
    setMessage("Password updated successfully. You can now continue to your dashboard.");
  }

  return (
    <div className="flex min-h-[72vh] items-center justify-center">
      <div className="w-full max-w-lg rounded-3xl border border-[#cfe0e8] bg-white p-8 shadow-[0_26px_46px_-32px_rgba(16,24,40,0.45)] md:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0f766e]">Account Recovery</p>
        <h1 className="mt-2 text-3xl font-semibold text-[#13303f]">Choose a new password</h1>
        <p className="mt-2 text-sm text-[#4a6575]">Set a new password for your JC RAD Inc. account.</p>

        <form onSubmit={onSubmit}>
          <Input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="New password"
            className="mt-6"
          />
          <Input
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirm new password"
            className="mt-4"
          />

          <Button
            type="submit"
            fullWidth
            disabled={submitting}
            className="mt-6 rounded-full bg-[#14b8a6] text-white shadow-[0_0_0_1px_rgba(20,184,166,0.24)] hover:bg-[#14b8a6]"
          >
            {submitting ? "Updating..." : "Update password"}
          </Button>
        </form>

        {message ? (
          <p className={`mt-4 text-sm ${success ? "text-[#0f766e]" : "text-[#9a3d3d]"}`}>{message}</p>
        ) : null}

        <p className="mt-5 text-sm text-[#4a6575]">
          Need a new reset link?{" "}
          <Link href="/forgot-password" className="font-semibold text-[#0f766e] underline underline-offset-4">
            Request again
          </Link>
        </p>
      </div>
    </div>
  );
}
