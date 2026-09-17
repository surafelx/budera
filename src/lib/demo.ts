import type { User } from "@/db/schema";

/** Demo visitors get throwaway accounts on this reserved domain. */
export const DEMO_EMAIL_DOMAIN = "demo.budera.app";

export const isDemoUser = (user: Pick<User, "email"> | null | undefined) => Boolean(user?.email.endsWith(`@${DEMO_EMAIL_DOMAIN}`));

export const demoEnabled = (env: NodeJS.ProcessEnv = process.env) => env.DEMO_ENABLED !== "false";

export const DEMO_READ_ONLY = "This is the demo workspace, so agents don't run and connections can't be saved. Create a free account to use your own company.";
