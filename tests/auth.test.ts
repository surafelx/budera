import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db";
import { users } from "@/db/schema";
import { createSession, deleteSession, hashPassword, hashToken, userForToken, verifyPassword } from "@/lib/auth";
import { companySchema, signupSchema } from "@/lib/validation";

describe("passwords", () => {
  it("verifies the right password and rejects others", async () => {
    const stored = await hashPassword("Correct-horse1");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("Correct-horse1", stored)).toBe(true);
    expect(await verifyPassword("correct-horse1", stored)).toBe(false);
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
  });

  it("salts each hash", async () => {
    expect(await hashPassword("Same-pass1")).not.toEqual(await hashPassword("Same-pass1"));
  });
});

describe("sessions", () => {
  let db: Db;
  beforeAll(async () => {
    db = await createPgliteDb("memory://");
  });

  it("creates, resolves and deletes a session without storing the raw token", async () => {
    const [u] = await db.insert(users).values({ email: "a@b.co", name: "A", passwordHash: "x" }).returning();
    const { token } = await createSession(db, u.id);
    expect((await userForToken(db, token))?.id).toBe(u.id);
    expect(await userForToken(db, hashToken(token))).toBeNull();
    await deleteSession(db, token);
    expect(await userForToken(db, token)).toBeNull();
    expect(await userForToken(db, undefined)).toBeNull();
  });
});

describe("validation", () => {
  it("requires a strong enough password", () => {
    expect(signupSchema.safeParse({ name: "S", email: "s@x.io", password: "short" }).success).toBe(false);
    expect(signupSchema.safeParse({ name: "S", email: "s@x.io", password: "Longenough1" }).success).toBe(true);
  });

  it("adds https:// to bare websites and rejects junk", () => {
    const base = {
      name: "Kaffa", industry: "Coffee", country: "Ethiopia", stage: "Early revenue", teamSize: "2–5",
      revenueBand: "Under $10k / month", offering: "Roasted coffee", targetCustomers: "Cafes", goals: "Export",
    };
    const ok = companySchema.safeParse({ ...base, website: "kaffa.et" });
    expect(ok.success && ok.data.website).toBe("https://kaffa.et");
    expect(companySchema.safeParse({ ...base, website: "not a site" }).success).toBe(false);
    expect(companySchema.safeParse({ ...base, website: "" }).success).toBe(true);
  });
});
