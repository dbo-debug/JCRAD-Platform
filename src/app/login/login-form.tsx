"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

type LoginFormProps = {
  returnTo: string;
};

export default function LoginForm({ returnTo }: LoginFormProps) {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
      setSubmitting(false);
      return;
    }

    void fetch("/api/platform-events/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: "user_login",
        user_id: data?.user?.id || null,
        user_email: data?.user?.email || email.trim().toLowerCase(),
        metadata: {
          source: "password_login",
          return_to: returnTo || "/dashboard",
        },
      }),
    }).catch(() => {});

    window.location.href = returnTo || "/dashboard";
  }

  return (
    <div className="flex items-center justify-center">
      <div className="w-full max-w-lg rounded-3xl border border-[#cfe0e8] bg-white p-8 shadow-[0_26px_46px_-32px_rgba(16,24,40,0.45)] md:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0f766e]">Customer Access</p>
        <h1 className="mt-2 text-3xl font-semibold text-[#13303f]">Sign in to continue</h1>
        <p className="mt-2 text-sm text-[#4a6575]">Access your estimates, onboarding, and customer portal.</p>

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
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            className="mt-4"
          />
          <div className="mt-2 text-right">
            <Link href="/forgot-password" className="text-sm font-semibold text-[#0f766e] underline underline-offset-4">
              Forgot password?
            </Link>
          </div>

          <Button
            type="submit"
            fullWidth
            disabled={submitting}
            className="mt-6 rounded-full bg-[#14b8a6] text-white shadow-[0_0_0_1px_rgba(20,184,166,0.24)] hover:bg-[#14b8a6]"
          >
            {submitting ? "Signing in..." : "Sign in"}
          </Button>

          <p className="mt-4 text-center text-sm text-[#4a6575]">
            Need an account?{" "}
            <Link href="/signup" className="font-semibold text-[#0f766e] underline underline-offset-4">
              Create account
            </Link>
          </p>
        </form>

        {message ? <p className="mt-4 text-sm text-[#0f766e]">{message}</p> : null}

        <div className="mt-6 rounded-2xl border border-[#d9e7ee] bg-[#f5fbfd] p-4 text-sm text-[#446172]">
          <p>
            Need access? Start by exploring the menu, then create an account when you&apos;re ready to build an
            estimate.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm font-semibold">
            <Link href="/menu" className="text-[#0f766e] underline underline-offset-4">
              View Menu
            </Link>
            <Link href="/contact" className="text-[#2c4c5b] underline underline-offset-4">
              Contact
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
