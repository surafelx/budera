"use client";

import { useId, useState } from "react";
import { REVENUE_BANDS, STAGES, TEAM_SIZES } from "@/lib/validation";

export type CompanyDraft = {
  name: string;
  website: string;
  industry: string;
  country: string;
  stage: string;
  teamSize: string;
  revenueBand: string;
  offering: string;
  businessModel: string;
  targetCustomers: string;
  competitors: string[];
  goals: string;
  challenges: string;
};

export const EMPTY_COMPANY: CompanyDraft = {
  name: "", website: "", industry: "", country: "", stage: "", teamSize: "", revenueBand: "",
  offering: "", businessModel: "", targetCustomers: "", competitors: [], goals: "", challenges: "",
};

export type Section = "basics" | "size" | "offering" | "market" | "goals";

export const SECTIONS: { id: Section; title: string; intro: string; keys: (keyof CompanyDraft)[] }[] = [
  { id: "basics", title: "The basics", intro: "So the agents know who they're working for.", keys: ["name", "website", "industry", "country"] },
  { id: "size", title: "Where you are", intro: "Advice changes a lot between an idea and a 50-person company.", keys: ["stage", "teamSize", "revenueBand"] },
  { id: "offering", title: "What you sell", intro: "Be concrete. The more specific you are, the more specific the brief.", keys: ["offering", "businessModel", "targetCustomers"] },
  { id: "market", title: "Who you're up against", intro: "Competitor Radar starts with these and finds the ones you missed.", keys: ["competitors"] },
  { id: "goals", title: "What you want next", intro: "Growth GPS plans backwards from this.", keys: ["goals", "challenges"] },
];

type Props = {
  section: Section;
  value: CompanyDraft;
  onChange: (next: CompanyDraft) => void;
  errors: Record<string, string>;
};

export function CompanyFields({ section, value, onChange, errors }: Props) {
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const set = <K extends keyof CompanyDraft>(key: K, v: CompanyDraft[K]) => onChange({ ...value, [key]: v });
  const cls = (k: string) => `field${errors[k] ? " has-error" : ""}`;
  const err = (k: string) => errors[k] && <span className="error">{errors[k]}</span>;

  if (section === "basics") {
    return (
      <div className="form-grid">
        <div className={cls("name")}>
          <label htmlFor={id("name")}>Company name</label>
          <input id={id("name")} className="input" value={value.name} onChange={(e) => set("name", e.target.value)} autoComplete="organization" />
          {err("name")}
        </div>
        <div className={cls("website")}>
          <label htmlFor={id("website")}>Website <span className="optional">optional</span></label>
          <input id={id("website")} className="input" inputMode="url" placeholder="yourcompany.com" value={value.website} onChange={(e) => set("website", e.target.value)} />
          {err("website")}
        </div>
        <div className={cls("industry")}>
          <label htmlFor={id("industry")}>Industry</label>
          <input id={id("industry")} className="input" placeholder="Specialty coffee roasting" value={value.industry} onChange={(e) => set("industry", e.target.value)} />
          {err("industry")}
        </div>
        <div className={cls("country")}>
          <label htmlFor={id("country")}>Where you operate</label>
          <input id={id("country")} className="input" placeholder="Addis Ababa, Ethiopia" value={value.country} onChange={(e) => set("country", e.target.value)} autoComplete="country-name" />
          <span className="hint">My Paralegal uses this to pick the right rules.</span>
          {err("country")}
        </div>
      </div>
    );
  }

  if (section === "size") {
    return (
      <div className="form-stack">
        <ChoiceGroup label="Stage" name={id("stage")} options={STAGES} value={value.stage} onChange={(v) => set("stage", v)} error={errors.stage} />
        <ChoiceGroup label="Team size" name={id("teamSize")} options={TEAM_SIZES} value={value.teamSize} onChange={(v) => set("teamSize", v)} error={errors.teamSize} />
        <ChoiceGroup label="Monthly revenue" name={id("revenueBand")} options={REVENUE_BANDS} value={value.revenueBand} onChange={(v) => set("revenueBand", v)} error={errors.revenueBand} />
      </div>
    );
  }

  if (section === "offering") {
    return (
      <div className="form-stack">
        <div className={cls("offering")}>
          <label htmlFor={id("offering")}>Products or services</label>
          <textarea id={id("offering")} className="textarea" placeholder="Single-origin roasted coffee sold by the bag online, and wholesale to cafés and hotels." value={value.offering} onChange={(e) => set("offering", e.target.value)} />
          {err("offering")}
        </div>
        <div className={cls("targetCustomers")}>
          <label htmlFor={id("targetCustomers")}>Who buys from you</label>
          <textarea id={id("targetCustomers")} className="textarea" placeholder="Independent cafés in Addis Ababa, and coffee lovers ordering online." value={value.targetCustomers} onChange={(e) => set("targetCustomers", e.target.value)} />
          {err("targetCustomers")}
        </div>
        <div className={cls("businessModel")}>
          <label htmlFor={id("businessModel")}>How you make money <span className="optional">optional</span></label>
          <textarea id={id("businessModel")} className="textarea" placeholder="Wholesale contracts plus direct online sales at higher margin." value={value.businessModel} onChange={(e) => set("businessModel", e.target.value)} />
          {err("businessModel")}
        </div>
      </div>
    );
  }

  if (section === "market") {
    return <CompetitorInput value={value.competitors} onChange={(v) => set("competitors", v)} error={errors.competitors} />;
  }

  return (
    <div className="form-stack">
      <div className={cls("goals")}>
        <label htmlFor={id("goals")}>Goals for the next 6 months</label>
        <textarea id={id("goals")} className="textarea" placeholder="Supply 20 cafés, launch online subscriptions, and ship a first export order." value={value.goals} onChange={(e) => set("goals", e.target.value)} />
        {err("goals")}
      </div>
      <div className={cls("challenges")}>
        <label htmlFor={id("challenges")}>What's getting in the way <span className="optional">optional</span></label>
        <textarea id={id("challenges")} className="textarea" placeholder="Inconsistent green-bean supply, and no time to chase wholesale leads." value={value.challenges} onChange={(e) => set("challenges", e.target.value)} />
        {err("challenges")}
      </div>
    </div>
  );
}

function ChoiceGroup({ label, name, options, value, onChange, error }: { label: string; name: string; options: readonly string[]; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <fieldset className={`field choice-field${error ? " has-error" : ""}`}>
      <legend className="label">{label}</legend>
      <div className="choices">
        {options.map((o) => (
          <label key={o} className="choice">
            <input type="radio" name={name} value={o} checked={value === o} onChange={() => onChange(o)} />
            <span>{o}</span>
          </label>
        ))}
      </div>
      {error && <span className="error">{error}</span>}
    </fieldset>
  );
}

function CompetitorInput({ value, onChange, error }: { value: string[]; onChange: (v: string[]) => void; error?: string }) {
  const [draft, setDraft] = useState("");
  const uid = useId();

  const add = () => {
    const names = draft.split(",").map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) return;
    const next = [...value];
    for (const n of names) if (!next.some((x) => x.toLowerCase() === n.toLowerCase())) next.push(n);
    onChange(next.slice(0, 8));
    setDraft("");
  };

  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <label htmlFor={uid}>Competitors <span className="optional">optional, up to 8</span></label>
      <div className="tag-input">
        <input
          id={uid}
          className="input"
          placeholder="Type a name and press Enter"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
          disabled={value.length >= 8}
        />
        <button type="button" className="btn btn-ghost btn-sm" onClick={add} disabled={!draft.trim() || value.length >= 8}>
          Add
        </button>
      </div>
      <span className="hint">Not sure? Leave it empty and Competitor Radar will look for them.</span>
      {value.length > 0 && (
        <ul className="tags">
          {value.map((c) => (
            <li key={c}>
              {c}
              <button type="button" aria-label={`Remove ${c}`} onClick={() => onChange(value.filter((x) => x !== c))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <span className="error">{error}</span>}
    </div>
  );
}
