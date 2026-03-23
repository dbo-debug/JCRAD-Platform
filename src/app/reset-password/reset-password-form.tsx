"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";
import type { EmailOtpType } from "@supabase/supabase-js";

export default function ResetPasswordForm() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let cancelled = false;

    function finish(nextMessage?: string) {
      if (cancelled) return;
      if (nextMessage) setMessage(nextMessage);
      setInitializing(false);
    }

    async function initializeRecovery() {
      const currentUrl = new URL(window.location.href);
      const hashParams = new URLSearchParams(currentUrl.hash.startsWith("#") ? currentUrl.hash.slice(1) : currentUrl.hash);
      const errorDescription =
        currentUrl.searchParams.get("error_description") || hashParams.get("error_description") || "";
      const errorCode = currentUrl.searchParams.get("error") || hashParams.get("error") || "";
      if (errorDescription || errorCode) {
        finish(decodeURIComponent(errorDescription || errorCode).replace(/\+/g, " "));
        return;
      }

      const tokenHash = currentUrl.searchParams.get("token_hash") || currentUrl.searchParams.get("token");
      const type = (currentUrl.searchParams.get("type") || hashParams.get("type") || "") as EmailOtpType;
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (tokenHash && type === "recovery") {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (error) {
          finish("Reset link is invalid or expired.");
          return;
        }
        window.history.replaceState(window.history.state, "", "/reset-password");
        finish();
        return;
      }

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          finish("Reset link is invalid or expired.");
          return;
        }
        window.history.replaceState(window.history.state, "", "/reset-password");
        finish();
        return;
      }

      const hasCode = currentUrl.searchParams.has("code");
      if (!hasCode) {
        finish();
        return;
      }

      const authStatePromise = new Promise<void>((resolve) => {
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((event) => {
          if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
            subscription.unsubscribe();
            resolve();
          }
        });

        window.setTimeout(() => {
          subscription.unsubscribe();
          resolve();
        }, 2000);
      });

      await authStatePromise;

      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        finish("Reset link is invalid or expired.");
        return;
      }

      finish();
    }

    void initializeRecovery();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!success) return;

    const timeoutId = window.setTimeout(() => {
      router.push("/portal");
    }, 1200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [router, success]);

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
    setMessage("Password updated successfully. Redirecting you to your portal...");
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
            disabled={submitting || initializing}
            className="mt-6 rounded-full bg-[#14b8a6] text-white shadow-[0_0_0_1px_rgba(20,184,166,0.24)] hover:bg-[#14b8a6]"
          >
            {initializing ? "Preparing reset..." : submitting ? "Updating..." : "Update password"}
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
