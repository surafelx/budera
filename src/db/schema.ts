import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const runStatusEnum = pgEnum("run_status", ["queued", "running", "succeeded", "failed"]);
export const priorityEnum = pgEnum("priority", ["high", "medium", "low"]);
export const taskStatusEnum = pgEnum("task_status", ["open", "done"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull().default(""),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    // SHA-256 of the session token. The raw token only ever lives in the user's cookie.
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    website: text("website").notNull().default(""),
    industry: text("industry").notNull(),
    country: text("country").notNull(),
    stage: text("stage").notNull(),
    teamSize: text("team_size").notNull(),
    revenueBand: text("revenue_band").notNull(),
    offering: text("offering").notNull(),
    businessModel: text("business_model").notNull().default(""),
    targetCustomers: text("target_customers").notNull(),
    competitors: jsonb("competitors").$type<string[]>().notNull().default([]),
    goals: text("goals").notNull(),
    challenges: text("challenges").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("companies_owner_idx").on(t.ownerId)],
);

/** Agents an owner builds in the app. They run on the same engine as the built-in five. */
export const customAgents = pgTable(
  "custom_agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role").notNull(),
    instructions: text("instructions").notNull(),
    tools: jsonb("tools").$type<string[]>().notNull().default([]),
    scoring: boolean("scoring").notNull().default(false),
    scoreLabel: text("score_label").notNull().default(""),
    schedule: text("schedule").notNull().default("manual"),
    model: text("model").notNull().default(""),
    lastScheduledAt: timestamp("last_scheduled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("custom_agents_company_idx").on(t.companyId)],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    // A built-in agent id ("growth_gps") or "custom:<custom agent id>".
    agentKey: text("agent_key").notNull(),
    customAgentId: uuid("custom_agent_id").references(() => customAgents.id, { onDelete: "cascade" }),
    status: runStatusEnum("status").notNull().default("queued"),
    output: jsonb("output"),
    sources: jsonb("sources").$type<{ url: string; title: string }[]>().notNull().default([]),
    error: text("error"),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("runs_company_agent_idx").on(t.companyId, t.agentKey, t.createdAt)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => agentRuns.id, { onDelete: "set null" }),
    agentKey: text("agent_key").notNull(),
    customAgentId: uuid("custom_agent_id").references(() => customAgents.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    priority: priorityEnum("priority").notNull().default("medium"),
    dueInDays: integer("due_in_days"),
    status: taskStatusEnum("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("tasks_company_status_idx").on(t.companyId, t.status)],
);

export type User = typeof users.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type CustomAgent = typeof customAgents.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type Task = typeof tasks.$inferSelect;
