export type SearchResult = { title: string; url: string; snippet: string; published?: string };

export type SearchProvider = {
  name: "tavily" | "brave" | "serper";
  search(query: string, limit: number): Promise<SearchResult[]>;
};

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

async function getJson(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<unknown> {
  const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(20_000) });
  if (res.status === 401 || res.status === 403) throw new ToolError("The search provider rejected the API key.");
  if (res.status === 429) throw new ToolError("The search provider is rate-limiting requests.");
  if (!res.ok) throw new ToolError(`The search provider returned ${res.status}.`);
  return res.json();
}

/** Returns the configured web search provider, or null when search isn't set up. */
export function searchProviderFromEnv(env: NodeJS.ProcessEnv = process.env, fetchImpl: FetchLike = fetch): SearchProvider | null {
  const name = (env.SEARCH_PROVIDER ?? "").trim().toLowerCase();
  const key = env.SEARCH_API_KEY?.trim();
  if (!key) return null;

  if (name === "tavily") {
    return {
      name,
      async search(query, limit) {
        const data = (await getJson(fetchImpl, "https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({ query, max_results: limit, search_depth: "basic" }),
        })) as { results?: { title?: string; url?: string; content?: string; published_date?: string }[] };
        return (data.results ?? []).filter((r) => r.url).map((r) => ({ title: r.title ?? r.url!, url: r.url!, snippet: r.content ?? "", published: r.published_date }));
      },
    };
  }

  if (name === "brave") {
    return {
      name,
      async search(query, limit) {
        const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`;
        const data = (await getJson(fetchImpl, url, { headers: { Accept: "application/json", "X-Subscription-Token": key } })) as {
          web?: { results?: { title?: string; url?: string; description?: string; age?: string }[] };
        };
        return (data.web?.results ?? []).filter((r) => r.url).map((r) => ({ title: r.title ?? r.url!, url: r.url!, snippet: r.description ?? "", published: r.age }));
      },
    };
  }

  if (name === "serper") {
    return {
      name,
      async search(query, limit) {
        const data = (await getJson(fetchImpl, "https://google.serper.dev/search", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-KEY": key },
          body: JSON.stringify({ q: query, num: limit }),
        })) as { organic?: { title?: string; link?: string; snippet?: string; date?: string }[] };
        return (data.organic ?? []).filter((r) => r.link).map((r) => ({ title: r.title ?? r.link!, url: r.link!, snippet: r.snippet ?? "", published: r.date }));
      },
    };
  }

  return null;
}
