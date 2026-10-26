"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setMessage(error.message); setLoading(false); return; }
    router.replace(searchParams.get("next") || "/management");
    router.refresh();
  }

  return <form onSubmit={signIn} className="mt-7 space-y-4">
    {searchParams.get("error") === "unauthorized" && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">Your account is not authorised for Management access.</p>}
    {message && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</p>}
    <label className="block text-sm font-semibold text-slate-700">Email<input required value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="name@company.com" className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100" /></label>
    <label className="block text-sm font-semibold text-slate-700">Password<input required value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" placeholder="••••••••" className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100" /></label>
    <button disabled={loading} className="w-full rounded-md bg-[#1e40af] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#17348d] disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Signing in…" : "Sign In"}</button>
  </form>;
}
