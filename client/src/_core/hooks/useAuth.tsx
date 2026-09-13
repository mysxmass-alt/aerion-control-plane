import { useCallback, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

export function useAuth(options: { redirectOnUnauthenticated?: boolean } = {}) {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const authQuery = trpc.auth.me.useQuery(undefined, { retry: false });
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      void authQuery.refetch();
      navigate("/");
    },
  });

  useEffect(() => {
    if (options.redirectOnUnauthenticated && !authQuery.isLoading && !authQuery.data) {
      navigate("/");
    }
  }, [authQuery.data, authQuery.isLoading, navigate, options.redirectOnUnauthenticated]);

  const requestMagicLink = useCallback(async () => {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes("@")) {
      setMessage("Enter a valid email address.");
      return;
    }
    setMessage(null);
    const response = await fetch("/api/auth/request-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: normalized }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Unable to send sign-in link");
    setMessage("If that email is allowed, a sign-in link is on its way.");
  }, [email]);

  const login = (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
      <form
        className="w-full max-w-md space-y-5 rounded-2xl border border-white/10 bg-white/[.04] p-8 shadow-2xl"
        onSubmit={async event => {
          event.preventDefault();
          try {
            await requestMagicLink();
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Unable to send sign-in link");
          }
        }}
      >
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[.24em] text-cyan-300">Aerion control plane</p>
          <h1 className="text-3xl font-semibold">Sign in with a magic link</h1>
          <p className="mt-3 text-sm text-slate-300">Enter your email and we will send a one-time secure login link.</p>
        </div>
        <label className="block text-sm text-slate-200">
          Email address
          <input
            className="mt-2 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-3 text-white outline-none focus:border-cyan-300"
            type="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </label>
        <button className="w-full rounded-lg bg-cyan-300 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60" type="submit">
          Send magic link
        </button>
        {message && <p className="text-sm text-slate-300" role="status">{message}</p>}
      </form>
    </div>
  );

  return {
    user: authQuery.data ?? null,
    loading: authQuery.isLoading,
    error: authQuery.error,
    logout: () => logoutMutation.mutate(),
    requestMagicLink,
    email,
    setEmail,
    login,
  };
}
