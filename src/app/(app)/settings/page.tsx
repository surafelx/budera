import type { Metadata } from "next";
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
  const { user, company } = await requireCompany();
  const setup = describeSetup();

  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Company profile</h1>
          <p className="page-sub">Every agent reads these answers. Keep them current and the brief stays sharp.</p>
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
        <header className="panel-head">
          <h2>AI setup</h2>
          <p>Configured on the server with environment variables. Keys are never shown here.</p>
        </header>
        <ul className="setup">
          <Status ok={setup.modelConfigured}>
            {setup.modelConfigured ? (
              <>
                Model <code>{setup.model}</code> via <code>{setup.providerHost}</code>
                {setup.researchModel ? (
                  <>
                    , research with <code>{setup.researchModel}</code>
                  </>
                ) : null}
                {!setup.hasApiKey && " (no API key set, fine for a local model server)"}
              </>
            ) : (
              <>No model. Set <code>LLM_MODEL</code>, <code>LLM_BASE_URL</code> and <code>LLM_API_KEY</code>.</>
            )}
          </Status>
          <Status ok={Boolean(setup.searchProvider)}>
            {setup.searchProvider ? (
              <>Web search through <code>{setup.searchProvider}</code></>
            ) : (
              <>No web search. Set <code>SEARCH_PROVIDER</code> (tavily, brave or serper) and <code>SEARCH_API_KEY</code>. Agents can still read pages.</>
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
          Signed in as <strong>{user.email}</strong>.
        </p>
      </section>
    </div>
  );
}
