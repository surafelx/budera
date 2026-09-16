import type { ToolDefinition } from "@/llm/client";
import { readPage } from "./read-page";
import { ToolError, type SearchProvider } from "./search";
import { TOOL_IDS, type Source, type ToolId } from "./meta";

export { TOOL_IDS, TOOL_INFO, type Source, type ToolId } from "./meta";

export const TOOL_DEFINITIONS: Record<ToolId, ToolDefinition> = {
  web_search: {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the public web. Returns titles, URLs and short snippets. Use focused queries; search again to go deeper.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "The search query" } },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  read_page: {
    type: "function",
    function: {
      name: "read_page",
      description: "Fetch a public web page and return its readable text. Use it on promising URLs from search results.",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "Full http(s) URL" } },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
};

export type ToolContext = {
  search: SearchProvider | null;
  readPage?: typeof readPage;
};

/** Which of the requested tools can actually run with the current server configuration. */
export function availableTools(requested: readonly string[], ctx: ToolContext): ToolId[] {
  return TOOL_IDS.filter((id) => requested.includes(id) && (id !== "web_search" || ctx.search !== null));
}

/** Runs one tool call from the model. Errors come back as text the model can read, not exceptions. */
export async function executeTool(name: string, rawArgs: string, ctx: ToolContext): Promise<{ content: string; sources: Source[] }> {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(rawArgs || "{}");
  } catch {
    return { content: "Error: the tool arguments were not valid JSON.", sources: [] };
  }

  try {
    if (name === "web_search") {
      if (!ctx.search) return { content: "Error: web search isn't configured on this server.", sources: [] };
      const query = String(args.query ?? "").trim().slice(0, 300);
      if (!query) return { content: "Error: provide a query.", sources: [] };
      const results = await ctx.search.search(query, 6);
      if (results.length === 0) return { content: `No results for "${query}".`, sources: [] };
      return {
        content: results.map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}${r.published ? `\nDate: ${r.published}` : ""}\n${r.snippet}`).join("\n\n"),
        sources: results.map((r) => ({ url: r.url, title: r.title })),
      };
    }
    if (name === "read_page") {
      const page = await (ctx.readPage ?? readPage)(String(args.url ?? ""));
      return { content: `Title: ${page.title}\nURL: ${page.url}\n\n${page.text || "(No readable text on this page.)"}`, sources: [{ url: page.url, title: page.title }] };
    }
    return { content: `Error: unknown tool "${name}".`, sources: [] };
  } catch (error) {
    return { content: `Error: ${error instanceof ToolError ? error.message : "the tool failed."}`, sources: [] };
  }
}
