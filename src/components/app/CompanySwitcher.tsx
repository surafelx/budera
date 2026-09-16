"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AgentGlyph } from "./AgentGlyph";
import { Dropdown } from "./Dropdown";

type CompanyOption = { id: string; name: string; industry: string };

export function CompanySwitcher({ companies, activeId, max }: { companies: CompanyOption[]; activeId: string; max: number }) {
  const router = useRouter();
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState("");
  const active = companies.find((c) => c.id === activeId) ?? companies[0];

  async function choose(id: string, close: () => void) {
    if (id === activeId) return close();
    setSwitching(id);
    setError("");
    try {
      const res = await fetch("/api/company/active", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: id }) });
      if (!res.ok) throw new Error();
      close();
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Couldn't switch. Try again.");
    } finally {
      setSwitching(null);
    }
  }

  return (
    <Dropdown
      buttonClass="switcher"
      panelClass="menu switcher-menu"
      label={
        <>
          <AgentGlyph agentKey={`company:${active.id}`} name={active.name} size={28} />
          <span className="switcher-text">
            <span className="switcher-name">{active.name}</span>
            <span className="switcher-sub">{active.industry}</span>
          </span>
          <svg className="chevron" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="sr-only">Switch company</span>
        </>
      }
    >
      {(close) => (
        <>
          <p className="menu-label mono">
            Companies · {companies.length} of {max}
          </p>
          <ul className="menu-list">
            {companies.map((c) => (
              <li key={c.id}>
                <button type="button" className={`menu-item${c.id === activeId ? " is-current" : ""}`} aria-current={c.id === activeId ? "true" : undefined} onClick={() => choose(c.id, close)} disabled={switching !== null}>
                  <AgentGlyph agentKey={`company:${c.id}`} name={c.name} size={26} />
                  <span className="menu-item-text">
                    <span>{c.name}</span>
                    <span className="menu-item-sub">{switching === c.id ? "Switching…" : c.industry}</span>
                  </span>
                  {c.id === activeId && (
                    <svg className="check" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {error && (
            <p className="menu-error" role="alert">
              {error}
            </p>
          )}
          <div className="menu-sep" />
          {companies.length < max ? (
            <Link href="/onboarding?new=1" className="menu-item" onClick={close}>
              <span className="menu-plus" aria-hidden="true">+</span>
              Add a company
            </Link>
          ) : (
            <p className="menu-note">You have the maximum of {max} companies.</p>
          )}
          <Link href="/settings" className="menu-item" onClick={close}>
            <span className="menu-plus" aria-hidden="true">⚙</span>
            {active.name} settings
          </Link>
        </>
      )}
    </Dropdown>
  );
}
