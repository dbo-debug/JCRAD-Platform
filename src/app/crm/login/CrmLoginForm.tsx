"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function CrmLoginForm({ returnTo }: { returnTo: string }) {
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
        event_type: "crm_login",
        user_id: data.user?.id || null,
        user_email: data.user?.email || email.trim().toLowerCase(),
        metadata: { source: "crm_hidden_entry", return_to: returnTo },
      }),
    }).catch(() => {});

    window.location.assign(returnTo);
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <label className="grid gap-1.5 text-sm font-medium text-[#355160]">
        <span>Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@jcradinc.com"
          className="rounded-xl border border-[#cfe0e8] bg-white px-4 py-3 text-[#173543] outline-none transition focus:border-[#0d6f7a] focus:ring-2 focus:ring-[#0d6f7a]/15"
        />
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-[#355160]">
        <span>Password</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          className="rounded-xl border border-[#cfe0e8] bg-white px-4 py-3 text-[#173543] outline-none transition focus:border-[#0d6f7a] focus:ring-2 focus:ring-[#0d6f7a]/15"
        />
      </label>

      <div className="text-right">
        <Link href="/forgot-password" className="text-sm font-semibold text-[#0d6f7a] underline underline-offset-4">
          Forgot password?
        </Link>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-[#173543] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0d6f7a] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Opening CRM..." : "Sign in to CRM"}
      </button>

      {message ? (
        <p role="alert" className="rounded-xl border border-[#f1d1d1] bg-[#fff5f5] px-3 py-2 text-sm text-[#991b1b]">
          {message}
        </p>
      ) : null}
    </form>
  );
}
