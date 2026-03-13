"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

type SignupFormProps = {
  returnTo: string;
};

export default function SignupForm({ returnTo }: SignupFormProps) {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setSuccess(false);

    if (!email.trim()) {
      setMessage("Email is required.");
      setSubmitting(false);
      return;
    }
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

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (error) {
      setMessage(error.message);
      setSubmitting(false);
      return;
    }

    void fetch("/api/platform-events/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: "user_signup",
        user_id: data?.user?.id || null,
        user_email: data?.user?.email || email.trim().toLowerCase(),
        metadata: {
          source: data?.session ? "instant_session" : "email_confirmation_pending",
          return_to: returnTo || "/dashboard",
        },
      }),
    }).catch(() => {});

    setSubmitting(false);
    setSuccess(true);

    if (data.session) {
      window.location.href = returnTo || "/dashboard";
      return;
    }

    setMessage("Account created. Check your email to confirm, then sign in.");
  }

  return (
    <div className="flex min-h-[72vh] items-center justify-center">
      <div className="w-full max-w-lg rounded-3xl border border-[#cfe0e8] bg-white p-8 shadow-[0_26px_46px_-32px_rgba(16,24,40,0.45)] md:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0f766e]">Customer Access</p>
        <h1 className="mt-2 text-3xl font-semibold text-[#13303f]">Create your account</h1>
        <p className="mt-2 text-sm text-[#4a6575]">Set up credentials to access estimates, onboarding, and your portal.</p>

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
          <Input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            className="mt-4"
          />
          <Input
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirm password"
            className="mt-4"
          />

          <Button
            type="submit"
            fullWidth
            disabled={submitting}
            className="mt-6 rounded-full bg-[#14b8a6] text-white shadow-[0_0_0_1px_rgba(20,184,166,0.24)] hover:bg-[#14b8a6]"
          >
            {submitting ? "Creating account..." : "Create account"}
          </Button>

          <p className="mt-4 text-center text-sm text-[#4a6575]">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-[#0f766e] underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </form>

        {message ? (
          <p className={`mt-4 text-sm ${success ? "text-[#0f766e]" : "text-[#9a3d3d]"}`}>{message}</p>
        ) : null}
      </div>
    </div>
  );
}
