import type { Metadata } from "next";
import { SettingsForm } from "@/components/company/SettingsForm";
import { requireCompany } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { user, company } = await requireCompany();
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
      <section className="panel account">
        <header className="panel-head"><h2>Account</h2></header>
        <p>Signed in as <strong>{user.email}</strong>.</p>
      </section>
    </div>
  );
}
