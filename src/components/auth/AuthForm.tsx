"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Mode = "signup" | "login";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [values, setValues] = useState({ name: "", email: "", password: "" });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setFields({});
    try {
      const body = mode === "signup" ? values : { email: values.email, password: values.password };
      const res = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json()) as { next?: string; error?: string; fields?: Record<string, string> };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        setFields(data.fields ?? {});
        return;
      }
      router.push(data.next ?? "/dashboard");
      router.refresh();
    } catch {
      setError("Couldn't reach Budera. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const fieldClass = (key: string) => `field${fields[key] ? " has-error" : ""}`;

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      {mode === "signup" && (
        <div className={fieldClass("name")}>
          <label htmlFor="name">Your name</label>
          <input id="name" className="input" autoComplete="name" value={values.name} onChange={set("name")} required />
          {fields.name && <span className="error">{fields.name}</span>}
        </div>
      )}
      <div className={fieldClass("email")}>
        <label htmlFor="email">Work email</label>
        <input id="email" type="email" className="input" autoComplete="email" value={values.email} onChange={set("email")} required />
        {fields.email && <span className="error">{fields.email}</span>}
      </div>
      <div className={fieldClass("password")}>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          className="input"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          value={values.password}
          onChange={set("password")}
          required
        />
        {fields.password ? (
          <span className="error">{fields.password}</span>
        ) : (
          mode === "signup" && <span className="hint">At least 8 characters, with an uppercase letter, a lowercase letter and a number.</span>
        )}
      </div>

      {error && (
        <p className="form-alert" role="alert">
          {error}
        </p>
      )}

      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? (mode === "signup" ? "Creating your account…" : "Signing in…") : mode === "signup" ? "Create account" : "Sign in"}
      </button>

      <p className="auth-switch">
        {mode === "signup" ? (
          <>
            Already have an account? <Link href="/login">Sign in</Link>
          </>
        ) : (
          <>
            New to Budera? <Link href="/signup">Create an account</Link>
          </>
        )}
      </p>
    </form>
  );
}
