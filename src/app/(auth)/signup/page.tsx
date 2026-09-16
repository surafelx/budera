import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { currentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignupPage() {
  if (await currentUser()) redirect("/dashboard");
  return (
    <div className="auth-card">
      <p className="eyebrow">Step 1 of 6</p>
      <h1>Create your Budera account</h1>
      <p className="auth-sub">Free during early access. Next, you'll tell Budera about your company.</p>
      <AuthForm mode="signup" />
    </div>
  );
}
