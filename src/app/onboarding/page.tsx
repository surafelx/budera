import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/company/OnboardingWizard";
import { companyFor, currentUser } from "@/lib/session";
import "../app.css";

export const metadata: Metadata = { title: "Set up your company" };

export default async function OnboardingPage() {
  const user = await currentUser();
  if (!user) redirect("/signup");
  if (await companyFor(user.id)) redirect("/dashboard");

  return (
    <div className="onboarding">
      <header className="onboarding-head">
        <Link href="/" className="app-wordmark dark" aria-label="Budera home">
          <span className="app-mark" aria-hidden="true" />
          Budera
        </Link>
        <span className="onboarding-help">You can change any answer later in Settings.</span>
      </header>
      <main className="onboarding-main">
        <OnboardingWizard firstName={user.name.split(" ")[0] || "there"} />
      </main>
    </div>
  );
}
