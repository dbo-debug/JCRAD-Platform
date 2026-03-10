"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"

export default function LoginPage() {
  const supabase = createClient()
  const [email, setEmail] = useState("")
  const [msg, setMsg] = useState<string>("")

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMsg("Sending link...")

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: "http://localhost:3000/auth/callback" },
    })

    if (error) {
      setMsg(error.message)
      return
    }

    setMsg("Check your email for the login link.")
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8">
        <h1 className="text-2xl font-semibold mb-2">Login</h1>
        <p className="text-sm text-white/70 mb-6">We’ll email you a secure link.</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <input
            className="w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 outline-none"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />
          <button className="w-full rounded-xl bg-white text-black px-4 py-3 font-semibold">
            Send login link
          </button>
        </form>

        {msg ? <p className="mt-4 text-sm text-white/80">{msg}</p> : null}
      </div>
    </main>
  )
}