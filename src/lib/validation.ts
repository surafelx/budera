import { z } from "zod";

export const STAGES = ["Idea", "Pre-revenue", "Early revenue", "Growing", "Established"] as const;
export const TEAM_SIZES = ["Just me", "2–5", "6–20", "21–50", "51+"] as const;
export const REVENUE_BANDS = ["None yet", "Under $10k / month", "$10k–$50k / month", "$50k–$250k / month", "Over $250k / month"] as const;

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Tell us your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(200)
    .regex(/[a-z]/, "Add a lowercase letter")
    .regex(/[A-Z]/, "Add an uppercase letter")
    .regex(/[0-9]/, "Add a number"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

const text = (label: string, max: number) => z.string().trim().min(1, `Add ${label}`).max(max, `Keep ${label} under ${max} characters`);

export const companySchema = z.object({
  name: text("your company name", 120),
  website: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
    .refine((v) => !v || /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(v), "That doesn't look like a website address"),
  industry: text("your industry", 120),
  country: text("where you operate", 120),
  stage: z.enum(STAGES, { message: "Pick a stage" }),
  teamSize: z.enum(TEAM_SIZES, { message: "Pick a team size" }),
  revenueBand: z.enum(REVENUE_BANDS, { message: "Pick a revenue range" }),
  offering: text("what you sell", 1200),
  businessModel: z.string().trim().max(600).default(""),
  targetCustomers: text("who your customers are", 800),
  competitors: z
    .array(z.string().trim().min(1).max(120))
    .max(8, "List up to 8 competitors")
    .default([]),
  goals: text("your goals for the next 6 months", 1200),
  challenges: z.string().trim().max(1200).default(""),
});

export type CompanyInput = z.infer<typeof companySchema>;
