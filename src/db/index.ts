import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

type Cache = { db?: Promise<Db> };
const globalCache = globalThis as unknown as { __buderaDb?: Cache };
const cache: Cache = (globalCache.__buderaDb ??= {});

/**
 * DATABASE_URL set -> real Postgres (production). Run `npm run db:migrate` on deploy.
 * DATABASE_URL empty -> embedded PGlite in ./.data, migrated automatically (local development).
 */
export function getDb(): Promise<Db> {
  cache.db ??= connect();
  return cache.db;
}

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const client = postgres(url, { max: 5, prepare: false });
    return drizzle(client, { schema }) as unknown as Db;
  }
  return createPgliteDb(process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite"));
}

/** Also used by tests with "memory://". */
export async function createPgliteDb(dataDir: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  if (!dataDir.includes("://")) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.dirname(dataDir), { recursive: true });
  }
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as Db;
}

export { schema };
