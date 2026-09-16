import { z } from "zod";
import { TOOL_IDS } from "@/tools/meta";

export const MAX_CUSTOM_AGENTS = 10;
export const SCHEDULES = ["manual", "daily", "weekly"] as const;
export type Schedule = (typeof SCHEDULES)[number];

export const customAgentSchema = z
  .object({
    name: z.string().trim().min(2, "Give your agent a name").max(40, "Keep the name under 40 characters"),
    role: z.string().trim().min(5, "Describe the agent's job in a sentence").max(160, "Keep the role under 160 characters"),
    instructions: z.string().trim().min(40, "Write at least a couple of sentences of instructions").max(4000, "Keep instructions under 4,000 characters"),
    tools: z.array(z.enum(TOOL_IDS)).max(TOOL_IDS.length).default([]),
    scoring: z.boolean().default(false),
    scoreLabel: z.string().trim().max(40, "Keep the score label under 40 characters").default(""),
    schedule: z.enum(SCHEDULES).default("manual"),
    model: z
      .string()
      .trim()
      .max(120)
      .regex(/^[A-Za-z0-9._:/@-]*$/, "Model names can only use letters, numbers and . _ : / @ -")
      .default(""),
  })
  .refine((a) => !a.scoring || a.scoreLabel.length > 0, { message: "Say what the score measures", path: ["scoreLabel"] });

export type CustomAgentInput = z.infer<typeof customAgentSchema>;

export type AgentTemplate = { id: string; label: string; blurb: string; agent: CustomAgentInput };

export const TEMPLATES: AgentTemplate[] = [
  {
    id: "pricing",
    label: "Pricing Analyst",
    blurb: "Checks your prices against competitors and what customers will pay.",
    agent: {
      name: "Pricing Analyst",
      role: "Reviews our pricing against the market and suggests changes that protect margin.",
      instructions:
        "Find how competitors in our region price comparable products or services, including tiers, discounts and bundles. Compare them with what we sell and who we sell to. Recommend price changes, new packages or tests we could run, and estimate the effect on revenue. Flag anything that would hurt trust with existing customers.",
      tools: ["web_search", "read_page"],
      scoring: true,
      scoreLabel: "Pricing strength",
      schedule: "weekly",
      model: "",
    },
  },
  {
    id: "funding",
    label: "Grant & Funding Scout",
    blurb: "Finds grants, competitions and investors that fit your stage.",
    agent: {
      name: "Funding Scout",
      role: "Finds grants, accelerators, competitions and investors we qualify for.",
      instructions:
        "Search for open grants, accelerator programmes, pitch competitions and investors that fund companies at our stage, in our industry and our country. Only include opportunities that are currently open or open within the next three months, with deadlines. For each, explain why we qualify and what the application needs. Tasks should be the next step for the best two or three.",
      tools: ["web_search", "read_page"],
      scoring: false,
      scoreLabel: "",
      schedule: "weekly",
      model: "",
    },
  },
  {
    id: "hiring",
    label: "Hiring Advisor",
    blurb: "Tells you who to hire next, and when.",
    agent: {
      name: "Hiring Advisor",
      role: "Advises on the next hires, roles and timing based on our goals and team size.",
      instructions:
        "Look at our goals, stage, team size and challenges. Decide which role we should hire next and which work we should outsource instead. For the top role, outline responsibilities, the level of experience needed, a realistic salary range for our location if you can find it, and where to find candidates. Warn us if hiring now would be premature.",
      tools: ["web_search"],
      scoring: true,
      scoreLabel: "Team readiness",
      schedule: "manual",
      model: "",
    },
  },
  {
    id: "content",
    label: "Content Planner",
    blurb: "Plans a month of posts your customers will actually read.",
    agent: {
      name: "Content Planner",
      role: "Plans social and blog content that brings in our kind of customer.",
      instructions:
        "Work out what our customers care about and search for topics and formats that are getting attention in our industry right now. Propose a four-week content plan with specific post ideas, the channel for each, and the call to action. Keep it doable for a small team, with no more than three posts a week.",
      tools: ["web_search"],
      scoring: false,
      scoreLabel: "",
      schedule: "manual",
      model: "",
    },
  },
];
