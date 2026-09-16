import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { currentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/dashboard");
  return (
    <div className="auth-card">
      <h1>Welcome back</h1>
      <p className="auth-sub">Sign in to see your latest brief.</p>
      <AuthForm mode="login" />
    </div>
  );
}
