import { describe, expect, it } from "vitest";
import { customAgentSchema } from "@/agents/custom";
import { availableTools, executeTool } from "@/tools";
import { assertPublicUrl, htmlToText, isPrivateAddress, readPage } from "@/tools/read-page";
import { searchProviderFromEnv } from "@/tools/search";

const publicDns = async () => ["93.184.216.34"];

describe("page reader safety", () => {
  it("recognises private and special addresses", () => {
    for (const ip of ["127.0.0.1", "10.2.3.4", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["93.184.216.34", "8.8.8.8", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("rejects non-web schemes, odd ports, credentials, internal names and hosts that resolve privately", async () => {
    await expect(assertPublicUrl("file:///etc/passwd", publicDns)).rejects.toThrow(/http/);
    await expect(assertPublicUrl("http://example.com:8080/", publicDns)).rejects.toThrow(/ports/);
    await expect(assertPublicUrl("http://user:pw@example.com/", publicDns)).rejects.toThrow(/credentials/);
    await expect(assertPublicUrl("http://localhost/", publicDns)).rejects.toThrow(/Private/);
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data", publicDns)).rejects.toThrow(/Private/);
    await expect(assertPublicUrl("http://sneaky.example/", async () => ["10.0.0.5"])).rejects.toThrow(/Private/);
    await expect(assertPublicUrl("https://example.com/pricing", publicDns)).resolves.toBeInstanceOf(URL);
  });

  it("re-checks redirects so a public page can't bounce the reader to an internal address", async () => {
    const fetchImpl = async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } });
    await expect(readPage("https://example.com/", { fetch: fetchImpl, resolve: publicDns })).rejects.toThrow(/Private/);
  });

  it("returns readable text from HTML", async () => {
    const html = "<html><head><title>Pricing &amp; Plans</title><style>.x{}</style></head><body><script>alert(1)</script><h1>Plans</h1><p>Basic&nbsp;$10</p></body></html>";
    const page = await readPage("https://example.com/pricing", {
      resolve: publicDns,
      fetch: async () => new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }),
    });
    expect(page.title).toBe("Pricing & Plans");
    expect(page.text).toContain("Basic $10");
    expect(page.text).not.toMatch(/alert|\.x\{/);
    expect(htmlToText("<p>a</p><p>b</p>").text).toBe("a\nb");
  });
});

describe("tools", () => {
  it("only offers web search when a provider is configured", () => {
    expect(availableTools(["web_search", "read_page"], { search: null })).toEqual(["read_page"]);
    expect(searchProviderFromEnv({ SEARCH_PROVIDER: "brave" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(searchProviderFromEnv({ SEARCH_PROVIDER: "brave", SEARCH_API_KEY: "k" } as unknown as NodeJS.ProcessEnv)?.name).toBe("brave");
  });

  it("turns tool failures into text the model can read", async () => {
    expect((await executeTool("web_search", "not json", { search: null })).content).toMatch(/not valid JSON/);
    expect((await executeTool("web_search", '{"query":"x"}', { search: null })).content).toMatch(/isn't configured/);
    expect((await executeTool("delete_everything", "{}", { search: null })).content).toMatch(/unknown tool/);
  });
});

describe("custom agent validation", () => {
  const base = { name: "Pricing Analyst", role: "Reviews our pricing", instructions: "Compare our prices with competitors and recommend changes that protect margin." };

  it("accepts a reasonable agent and applies defaults", () => {
    const parsed = customAgentSchema.parse(base);
    expect(parsed).toMatchObject({ tools: [], scoring: false, schedule: "manual", model: "" });
  });

  it("requires a score label when scoring, and rejects unknown tools and odd model names", () => {
    expect(customAgentSchema.safeParse({ ...base, scoring: true }).success).toBe(false);
    expect(customAgentSchema.safeParse({ ...base, tools: ["run_shell"] }).success).toBe(false);
    expect(customAgentSchema.safeParse({ ...base, model: "gpt; rm -rf" }).success).toBe(false);
    expect(customAgentSchema.safeParse({ ...base, model: "openai/gpt-4.1-mini" }).success).toBe(true);
  });
});
