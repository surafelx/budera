// Tool names and labels only. Safe to import from client components; the tool implementations live in ./index.

export const TOOL_IDS = ["web_search", "read_page"] as const;
export type ToolId = (typeof TOOL_IDS)[number];

export const TOOL_INFO: Record<ToolId, { label: string; description: string }> = {
  web_search: { label: "Search the web", description: "Look up current news, companies, prices and trends." },
  read_page: { label: "Read web pages", description: "Open a page, such as a competitor's pricing page, and read it." },
};

export type Source = { url: string; title: string };
