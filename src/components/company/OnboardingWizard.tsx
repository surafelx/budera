"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CompanyFields, EMPTY_COMPANY, SECTIONS, type CompanyDraft } from "./CompanyFields";

// Checked before moving on, so owners fix a step while it's still on screen.
const REQUIRED: Record<string, (keyof CompanyDraft)[]> = {
  basics: ["name", "industry", "country"],
  size: ["stage", "teamSize", "revenueBand"],
  offering: ["offering", "targetCustomers"],
  market: [],
  goals: ["goals"],
};

const LABELS: Partial<Record<keyof CompanyDraft, string>> = {
  name: "Add your company name", industry: "Add your industry", country: "Add where you operate",
  stage: "Pick a stage", teamSize: "Pick a team size", revenueBand: "Pick a revenue range",
  offering: "Describe what you sell", targetCustomers: "Describe who buys from you", goals: "Add at least one goal",
};

export function OnboardingWizard({ firstName }: { firstName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<CompanyDraft>(EMPTY_COMPANY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState("");
  const [busy, setBusy] = useState(false);

  const section = SECTIONS[step];
  const last = step === SECTIONS.length - 1;

  function checkStep(): boolean {
    const missing: Record<string, string> = {};
    for (const key of REQUIRED[section.id]) {
      const v = draft[key];
      if (typeof v === "string" && !v.trim()) missing[key] = LABELS[key] ?? "Required";
    }
    setErrors(missing);
    return Object.keys(missing).length === 0;
  }

  async function next(e: React.FormEvent) {
    e.preventDefault();
    setAlert("");
    if (!checkStep()) return;
    if (!last) {
      setStep((s) => s + 1);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/company", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const data = (await res.json()) as { error?: string; fields?: Record<string, string>; next?: string };
      if (!res.ok) {
        setErrors(data.fields ?? {});
        const firstBad = SECTIONS.findIndex((s) => s.keys.some((k) => data.fields?.[k]));
        if (firstBad >= 0) setStep(firstBad);
        setAlert(data.error ?? "Some answers need another look.");
        return;
      }
      router.push(data.next ?? "/dashboard");
      router.refresh();
    } catch {
      setAlert("Couldn't save your profile. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="wizard" onSubmit={next} noValidate>
      <div className="wizard-progress" aria-hidden="true">
        {SECTIONS.map((s, i) => (
          <span key={s.id} className={i <= step ? "on" : ""} />
        ))}
      </div>
      <p className="eyebrow">Step {step + 2} of 6</p>
      <h1>{step === 0 ? `Welcome, ${firstName}. Tell us about your company.` : section.title}</h1>
      <p className="wizard-intro">{section.intro}</p>

      <CompanyFields section={section.id} value={draft} onChange={setDraft} errors={errors} />

      {alert && (
        <p className="form-alert" role="alert">
          {alert}
        </p>
      )}

      <div className="wizard-actions">
        {step > 0 && (
          <button type="button" className="btn btn-ghost" onClick={() => { setErrors({}); setStep((s) => s - 1); }} disabled={busy}>
            Back
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {last ? (busy ? "Saving…" : "Finish and open my dashboard") : "Continue"}
        </button>
      </div>
    </form>
  );
}
