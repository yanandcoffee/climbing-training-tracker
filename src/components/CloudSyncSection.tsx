import { useState } from "react";
import { syncConfigured, useSync } from "../sync/useSync";

const input =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800";
const primary =
  "rounded-xl bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40";
const secondary =
  "rounded-xl bg-slate-200 px-3 py-2 text-sm font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200";

export default function CloudSyncSection() {
  const {
    status,
    email,
    lastSyncedAt,
    error,
    codeSentTo,
    sendCode,
    verifyCode,
    signInWithPassword,
    signUpWithPassword,
    signOut,
    syncNow,
  } = useSync();
  const [mode, setMode] = useState<"password" | "code">("password");
  const [emailInput, setEmailInput] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      /* the store already surfaced the message in `error` */
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Cloud sync
      </h2>

      {!syncConfigured ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-600">
          Not set up. Add <code>VITE_SUPABASE_URL</code> and{" "}
          <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code> and
          restart — see the README. Your data stays on this device until then.
        </p>
      ) : status === "signed_out" ? (
        codeSentTo ? (
          <div className="space-y-2">
            <p className="text-sm">
              We emailed a code to <b>{codeSentTo}</b>. Enter it below.
            </p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Code from the email"
              className={`${input} tracking-widest`}
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || code.length < 6}
                onClick={() => run(() => verifyCode(codeSentTo, code).then(() => setCode("")))}                className={`${primary} flex-1`}
              >
                {busy ? "Checking…" : "Sign in"}
              </button>
              <button
                type="button"
                onClick={() => useSync.setState({ codeSentTo: null, error: null })}
                className={secondary}
              >
                Back
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2" role="radiogroup" aria-label="Sign-in method">
              {(["password", "code"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium ${
                    mode === m
                      ? "bg-sky-600 text-white"
                      : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                  }`}
                >
                  {m === "password" ? "Password" : "Email code"}
                </button>
              ))}
            </div>

            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className={input}
            />

            {mode === "password" ? (
              <>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password (6+ characters)"
                  autoComplete="current-password"
                  className={input}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy || !emailInput.includes("@") || password.length < 6}
                    onClick={() => run(() => signInWithPassword(emailInput.trim(), password))}
                    className={`${primary} flex-1`}
                  >
                    {busy ? "Working…" : "Sign in"}
                  </button>
                  <button
                    type="button"
                    disabled={busy || !emailInput.includes("@") || password.length < 6}
                    onClick={() => run(() => signUpWithPassword(emailInput.trim(), password))}
                    className={secondary}
                  >
                    Create account
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  First time? Choose a password and tap Create account. Use the
                  same email and password on your other devices.
                </p>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy || !emailInput.includes("@")}
                  onClick={() => run(() => sendCode(emailInput.trim()))}
                  className={`${primary} w-full`}
                >
                  {busy ? "Sending…" : "Email me a code"}
                </button>
                <p className="text-[11px] text-slate-400">
                  Needs the emailed code set up in Supabase (see the README).
                </p>
              </>
            )}
          </div>
        )
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
            <div className="min-w-0">
              <p className="truncate font-medium">{email}</p>
              <p className="text-xs text-slate-500">
                {status === "syncing"
                  ? "Syncing…"
                  : status === "error"
                    ? "Sync failed"
                    : lastSyncedAt
                      ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString()}`
                      : "Signed in"}
              </p>
            </div>
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                status === "error"
                  ? "bg-red-500"
                  : status === "syncing"
                    ? "animate-pulse bg-amber-500"
                    : "bg-green-500"
              }`}
              aria-hidden
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={status === "syncing"}
              onClick={() => void syncNow()}
              className={`${primary} flex-1`}
            >
              Sync now
            </button>
            <button type="button" onClick={() => void signOut()} className={secondary}>
              Sign out
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-100 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
      <p className="text-[11px] text-slate-400">
        Syncs your check-ins, exercises, workouts and schedule. API keys are
        only uploaded if you turn on “Save API keys to my account” above.
      </p>
    </section>
  );
}
