export function dueLabel(createdAt: Date, dueInDays: number | null, status: "open" | "done", completedAt: Date | null, now = new Date()): string {
  if (status === "done") return completedAt ? `Done ${relativeTime(completedAt, now)}` : "Done";
  if (dueInDays == null) return "No due date";
  const due = new Date(createdAt.getTime() + dueInDays * 86400000);
  const days = Math.ceil((due.getTime() - now.getTime()) / 86400000);
  if (days < 0) return `Overdue by ${-days} day${days === -1 ? "" : "s"}`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

export function relativeTime(date: Date, now = new Date()): string {
  const s = Math.round((now.getTime() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function scoreBand(value: number): "strong" | "fair" | "weak" {
  return value >= 70 ? "strong" : value >= 45 ? "fair" : "weak";
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;
export function byPriorityThenDue<T extends { priority: "high" | "medium" | "low"; dueInDays: number | null; createdAt: Date }>(a: T, b: T): number {
  const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (p !== 0) return p;
  const due = (t: T) => t.createdAt.getTime() + (t.dueInDays ?? 60) * 86400000;
  return due(a) - due(b);
}
