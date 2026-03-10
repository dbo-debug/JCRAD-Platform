"use client"

import { useState } from "react"

export function AdminUserCreator() {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("customer")
  const [msg, setMsg] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    if (!email) return

    setLoading(true)
    setMsg("Creating user...")

    const res = await fetch("/api/admin/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    })

    const data = await res.json()

    if (!res.ok) {
      setMsg(data.error)
      setLoading(false)
      return
    }

    setMsg("User created successfully.")
    setEmail("")
    setLoading(false)
  }

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
      <h3 className="text-lg font-semibold mb-4">Create User</h3>

      <input
        className="w-full mb-3 rounded-xl bg-black/40 border border-white/10 px-4 py-3 outline-none"
        placeholder="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
      />

      <select
        className="w-full mb-3 rounded-xl bg-black/40 border border-white/10 px-4 py-3 outline-none"
        value={role}
        onChange={(e) => setRole(e.target.value)}
      >
        <option value="customer">Customer</option>
        <option value="sales">Sales</option>
        <option value="admin">Admin</option>
      </select>

      <button
        onClick={handleCreate}
        disabled={loading}
        className="w-full rounded-xl bg-white text-black px-4 py-3 font-semibold disabled:opacity-50"
      >
        {loading ? "Creating..." : "Create User"}
      </button>

      {msg && <p className="mt-3 text-sm text-white/70">{msg}</p>}
    </div>
  )
}