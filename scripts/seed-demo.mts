/**
 * Local demo data: two fictional companies with a report from every agent, custom agents and sample connections,
 * so the app can be explored without any API keys. Refuses to run against a real database.
 *
 *   npm run seed:demo
 *
 * Visitors to a deployed site get the same workspace from the "Try the live demo" button instead.
 */
import path from "node:path";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { createPgliteDb } from "../src/db";
import { users } from "../src/db/schema";
import { seedDemoWorkspace } from "../src/demo/seed";
import { createSession, hashPassword } from "../src/lib/auth";

if (process.env.DATABASE_URL) {
  console.error("DATABASE_URL is set. The demo seed only runs against the local embedded database.");
  process.exit(1);
}

const EMAIL = "demo@budera.local";
const db = await createPgliteDb(process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite"));

await db.delete(users).where(eq(users.email, EMAIL));
const password = randomBytes(9).toString("base64url");
const [user] = await db.insert(users).values({ email: EMAIL, name: "Hanna Tesfaye", passwordHash: await hashPassword(password) }).returning();
await seedDemoWorkspace(db, user.id);
const { token } = await createSession(db, user.id);
console.log(`Demo workspace seeded.\n  Email:    ${EMAIL}\n  Password: ${password}\n  Session:  ${token}`);
process.exit(0);