import { useCallback, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

type AuthMode = "create" | "password" | "magic";

export function useAuth(options: { redirectOnUnauthenticated?: boolean } = {}) {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<AuthMode>("create");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const authQuery = trpc.auth.me.useQuery(undefined, { retry: false });
  const logoutMutation = trpc.auth.logout.useMutation({ onSuccess: () => { void authQuery.refetch(); navigate("/"); } });
  useEffect(() => { if (options.redirectOnUnauthenticated && !authQuery.isLoading && !authQuery.data) navigate("/"); }, [authQuery.data, authQuery.isLoading, navigate, options.redirectOnUnauthenticated]);

  const submit = useCallback(async () => {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes("@")) throw new Error("Enter a valid Gmail or email address.");
    setBusy(true);
    try {
      const endpoint = mode === "create" ? "/api/auth/register" : mode === "magic" ? "/api/auth/request-link" : "/api/auth/password";
      const payload = mode === "create" ? { name, email: normalized, password } : mode === "magic" ? { email: normalized } : { email: normalized, password };
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Unable to continue");
      if (mode === "create") setMessage("Account created. Check Gmail—including Spam—for your verification link.");
      else if (mode === "magic") setMessage("Check Gmail—including Spam—for your secure MYSTIC HOST sign-in link.");
      else await authQuery.refetch();
    } finally { setBusy(false); }
  }, [authQuery, email, mode, name, password]);

  const switchMode = (next: AuthMode) => { setMode(next); setMessage(null); setPassword(""); };
  const login = <div className="flex min-h-screen items-center justify-center overflow-hidden bg-[#070d14] px-4 py-10 text-white"><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(75,218,190,.14),transparent_35%),radial-gradient(circle_at_85%_80%,rgba(116,91,255,.16),transparent_32%)]" /><div className="relative grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/10 bg-white/[.045] shadow-2xl shadow-black/40 md:grid-cols-[.9fr_1.1fr]"><section className="hidden flex-col justify-between bg-gradient-to-br from-cyan-300/[.13] via-transparent to-violet-400/[.12] p-10 md:flex"><img className="h-14 w-auto self-start" src="/mystic-host-logo.svg" alt="MYSTIC HOST" /><div><p className="mb-4 text-xs font-semibold uppercase tracking-[.28em] text-cyan-200">Private cloud hosting</p><h2 className="max-w-sm text-4xl font-semibold leading-tight tracking-[-.04em]">Your servers.<br /><span className="text-cyan-200">Your control.</span></h2><p className="mt-5 max-w-sm text-sm leading-6 text-slate-300">Launch, manage, and protect your workloads from one calm, focused control panel.</p></div><p className="text-xs text-slate-500">MYSTIC HOST · secure infrastructure</p></section><section className="p-7 sm:p-10"><div className="mb-8 md:hidden"><img className="h-12 w-auto" src="/mystic-host-logo.svg" alt="MYSTIC HOST" /></div><div className="mb-7"><p className="mb-2 text-xs font-semibold uppercase tracking-[.24em] text-cyan-300">MYSTIC HOST</p><h1 className="text-3xl font-semibold tracking-[-.03em]">{mode === "create" ? "Create your account" : mode === "password" ? "Welcome back" : "Use a magic link"}</h1><p className="mt-3 text-sm leading-6 text-slate-300">{mode === "create" ? "Create your workspace account. We’ll send a verification link to Gmail." : mode === "password" ? "Sign in with the email and password you created." : "We’ll email a secure one-time sign-in link to your Gmail inbox."}</p></div><div className="mb-6 grid grid-cols-3 rounded-xl border border-white/10 bg-black/20 p-1"><button type="button" className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${mode === "create" ? "bg-cyan-300 text-slate-950" : "text-slate-400 hover:text-white"}`} onClick={() => switchMode("create")}>Create account</button><button type="button" className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${mode === "password" ? "bg-cyan-300 text-slate-950" : "text-slate-400 hover:text-white"}`} onClick={() => switchMode("password")}>Sign in</button><button type="button" className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${mode === "magic" ? "bg-cyan-300 text-slate-950" : "text-slate-400 hover:text-white"}`} onClick={() => switchMode("magic")}>Magic link</button></div><form className="space-y-4" onSubmit={async event => { event.preventDefault(); setMessage(null); try { await submit(); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to continue"); } }}>
      {mode === "create" && <label className="block text-sm text-slate-200">Your name<input className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300" value={name} onChange={event => setName(event.target.value)} placeholder="Alex Morgan" autoComplete="name" required /></label>}
      <label className="block text-sm text-slate-200">Gmail or email address<input className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@gmail.com" autoComplete="email" required /></label>
      {mode !== "magic" && <label className="block text-sm text-slate-200">Password{mode === "create" && <span className="ml-2 text-xs text-slate-500">12+ characters</span>}<input className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300" type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === "create" ? "Create a strong password" : "Your password"} autoComplete={mode === "create" ? "new-password" : "current-password"} required /></label>}
      <button className="w-full rounded-xl bg-cyan-300 px-4 py-3.5 font-semibold text-slate-950 shadow-lg shadow-cyan-300/10 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "create" ? "Create account & verify email" : mode === "magic" ? "Send Gmail magic link" : "Sign in securely"}</button>
      {message && <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/[.07] px-4 py-3 text-sm leading-5 text-cyan-100" role="status">{message}</div>}
    </form><p className="mt-6 text-center text-xs leading-5 text-slate-500">Email verification links expire after 15 minutes and can only be used once.</p></section></div></div>;
  return { user: authQuery.data ?? null, loading: authQuery.isLoading, error: authQuery.error, logout: () => logoutMutation.mutate(), requestMagicLink: submit, email, setEmail, login };
}
