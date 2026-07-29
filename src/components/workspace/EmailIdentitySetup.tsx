"use client";

import { FormEvent, useEffect, useState } from "react";

type Identity = {
  id: string;
  email: string;
  displayName: string | null;
  useForCommunications: boolean;
  useForAutomations: boolean;
  verifiedAt: string | null;
};

export default function EmailIdentitySetup({ returnTo }: { returnTo: string }) {
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [useForAutomations, setUseForAutomations] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/workspace/email/identities", { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(json.error || "Unable to load email identities"));
    setIdentities(Array.isArray(json.identities) ? json.identities : []);
    setConnectedEmail(json.connectedEmail ? String(json.connectedEmail) : null);
  }

  useEffect(() => {
    void load().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Unable to load email identities");
    });
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/workspace/email/identities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          displayName,
          useForCommunications: true,
          useForAutomations,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(json.error || "Unable to save email"));
      await load();
      setEmail("");
      setDisplayName("");
      setMessage(
        String(json.connectedEmail || "").toLowerCase() === String(json.identity?.email || "").toLowerCase()
          ? "Email saved and ready for CRM communications."
          : "Email saved. Connect the matching Google mailbox to enable sending."
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[24px] border border-[#deded8] bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7891a0]">Insert Email</p>
      <p className="mt-2 text-sm text-[#5c7483]">
        Add the sender address the CRM should use for direct communication and future automations.
      </p>

      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <input
          type="text"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Sender name"
          className="w-full rounded-lg border border-[#deded8] bg-white px-3 py-2 text-sm text-[#1f2d3a]"
        />
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@company.com"
          className="w-full rounded-lg border border-[#deded8] bg-white px-3 py-2 text-sm text-[#1f2d3a]"
        />
        <label className="flex items-start gap-2 text-sm text-[#4f6877]">
          <input
            type="checkbox"
            checked={useForAutomations}
            onChange={(event) => setUseForAutomations(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-[#deded8] text-[#1b1b1a]"
          />
          <span>Allow this address to be selected by CRM automations.</span>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-[#181817] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Saving..." : "Save Communication Email"}
        </button>
      </form>

      {error ? <p className="mt-3 text-sm text-[#991b1b]">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-[#405d6b]">{message}</p> : null}

      <div className="mt-4 space-y-2">
        {identities.map((identity) => {
          const ready =
            Boolean(identity.verifiedAt) &&
            identity.email.toLowerCase() === String(connectedEmail || "").toLowerCase();
          return (
            <div key={identity.id} className="rounded-2xl border border-[#deded8] bg-[#f7f7f4] px-3 py-3">
              <p className="truncate text-sm font-semibold text-[#181817]">{identity.email}</p>
              {identity.displayName ? <p className="mt-1 text-xs text-[#5c7483]">{identity.displayName}</p> : null}
              <p className={["mt-2 text-xs font-semibold", ready ? "text-[#405d6b]" : "text-[#9a6b00]"].join(" ")}>
                {ready ? "Ready for communications" : "Authorization required"}
              </p>
              <p className="mt-1 text-xs text-[#6d8593]">
                {identity.useForAutomations
                  ? ready
                    ? "Automation ready"
                    : "Automation pending authorization"
                  : "Automation disabled"}
              </p>
            </div>
          );
        })}
      </div>

      <a
        href={`/api/workspace/email/oauth/start?returnTo=${encodeURIComponent(returnTo)}`}
        className="mt-4 inline-flex rounded-full border border-[#deded8] bg-white px-3 py-1.5 text-sm font-semibold text-[#21424d] transition hover:border-[#1b1b1a] hover:text-[#1b1b1a]"
      >
        {connectedEmail ? "Reconnect Google Mailbox" : "Authorize Google Mailbox"}
      </a>
    </div>
  );
}
