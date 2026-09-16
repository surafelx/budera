import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/company/OnboardingWizard";
import { MAX_COMPANIES } from "@/lib/companies";
import { currentWorkspace } from "@/lib/session";
import "../app.css";

export const metadata: Metadata = { title: "Set up your company" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const workspace = await currentWorkspace();
  if (!workspace) redirect("/signup");
  const adding = workspace.companies.length > 0;
  if (adding && ((await searchParams).new !== "1" || workspace.companies.length >= MAX_COMPANIES)) redirect("/dashboard");

  return (
    <div className="onboarding">
      <header className="onboarding-head">
        <Link href={adding ? "/dashboard" : "/"} className="app-wordmark dark" aria-label={adding ? "Back to your dashboard" : "Budera home"}>
          <span className="app-mark" aria-hidden="true" />
          Budera
        </Link>
        {adding ? (
          <Link href="/dashboard" className="btn btn-ghost btn-sm">
            Cancel
          </Link>
        ) : (
          <span className="onboarding-help">You can change any answer later in Settings.</span>
        )}
      </header>
      <main className="onboarding-main">
        <OnboardingWizard firstName={workspace.user.name.split(" ")[0] || "there"} adding={adding} />
      </main>
    </div>
  );
}