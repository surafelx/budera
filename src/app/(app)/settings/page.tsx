import type { Metadata } from "next";
import Link from "next/link";
import { DeleteCompanyButton } from "@/components/company/DeleteCompanyButton";
import { SettingsForm } from "@/components/company/SettingsForm";
import { describeSetup } from "@/llm/config";
import { requireCompany } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="setup-row">
      <span className={`pill ${ok ? "ok" : "fail"}`}>{ok ? "Ready" : "Not set"}</span>
      <span>{children}</span>
    </li>
  );
}

export default async function SettingsPage() {
  const { user, company, companies } = await requireCompany();
  const setup = describeSetup();

  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <p className="eyebrow">Settings · {company.name}</p>
          <h1>Company profile</h1>
          <p className="page-sub">
            Every agent reads these answers for {company.name}. Keep them current and the brief stays sharp. Use the company switcher at the top to edit another company.
          </p>
        </div>
      </header>
      <SettingsForm
        initial={{
          name: company.name, website: company.website, industry: company.industry, country: company.country, stage: company.stage,
          teamSize: company.teamSize, revenueBand: company.revenueBand, offering: company.offering, businessModel: company.businessModel,
          targetCustomers: company.targetCustomers, competitors: company.competitors, goals: company.goals, challenges: company.challenges,
        }}
      />

      <section className="panel">
        <header className="panel-head row">
          <div>
            <h2>AI model, search and data</h2>
            <p>Each company connects its own model, web search and business data, with secrets encrypted. Anything not connected falls back to the server&apos;s settings.</p>
          </div>
          <Link href="/connections" className="btn btn-ghost btn-sm">
            Open Connections
          </Link>
        </header>
        <ul className="setup">
          <Status ok={setup.modelConfigured}>
            {setup.modelConfigured ? (
              <>
                Server default model <code>{setup.model}</code> via <code>{setup.providerHost}</code>
              </>
            ) : (
              <>No server default model. Connect one for this company, or set <code>LLM_MODEL</code> on the server.</>
            )}
          </Status>
          <Status ok={Boolean(setup.searchProvider)}>
            {setup.searchProvider ? (
              <>
                Server default web search through <code>{setup.searchProvider}</code>
              </>
            ) : (
              <>No server default web search. Connect a provider for this company, or set <code>SEARCH_PROVIDER</code>.</>
            )}
          </Status>
          <Status ok={setup.schedulingEnabled}>
            {setup.schedulingEnabled ? "Scheduled agents run daily and weekly." : <>Scheduled runs are off. Set <code>CRON_SECRET</code> and a cron job.</>}
          </Status>
        </ul>
      </section>
      <section className="panel account">
        <header className="panel-head">
          <h2>Account</h2>
        </header>
        <p>
          Signed in as <strong>{user.email}</strong>. You have {companies.length} {companies.length === 1 ? "company" : "companies"}.
        </p>
      </section>

      <DeleteCompanyButton name={company.name} others={companies.length - 1} />
    </div>
  );
}
