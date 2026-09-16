import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ToolError } from "./search";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_CHARS = 12_000;
const MAX_REDIRECTS = 3;

type Resolver = (hostname: string) => Promise<string[]>;
type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const defaultResolver: Resolver = async (hostname) => (await lookup(hostname, { all: true })).map((a) => a.address);

/** True for loopback, private, link-local, carrier-grade NAT, multicast, reserved and cloud metadata ranges. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v6);
}

/** Validates a URL an agent wants to read: public http(s) only, standard ports, and a hostname that resolves to public addresses. */
export async function assertPublicUrl(raw: string, resolve: Resolver = defaultResolver): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ToolError("That isn't a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ToolError("Only http and https pages can be read.");
  if (url.username || url.password) throw new ToolError("URLs with credentials can't be read.");
  if (url.port && url.port !== "80" && url.port !== "443") throw new ToolError("Only standard web ports can be read.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new ToolError("Private addresses can't be read.");
  }
  const addresses = isIP(host) ? [host] : await resolve(host).catch(() => {
    throw new ToolError("That website's address couldn't be found.");
  });
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw new ToolError("Private addresses can't be read.");
  return url;
}

export function htmlToText(html: string): { title: string; text: string } {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const text = html
    .replace(/<(script|style|noscript|svg|iframe|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title: decodeTitle(title), text };
}

function decodeTitle(t: string) {
  return t.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
}

export async function readPage(raw: string, deps: { fetch?: FetchLike; resolve?: Resolver } = {}): Promise<{ url: string; title: string; text: string }> {
  const fetchImpl = deps.fetch ?? fetch;
  let url = await assertPublicUrl(raw, deps.resolve);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetchImpl(url.toString(), {
      redirect: "manual",
      headers: { "User-Agent": "BuderaAgent/1.0 (+research)", Accept: "text/html,text/plain;q=0.9" },
      signal: AbortSignal.timeout(20_000),
    }).catch(() => {
      throw new ToolError("The page couldn't be loaded.");
    });

    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = await assertPublicUrl(new URL(res.headers.get("location")!, url).toString(), deps.resolve);
      continue;
    }
    if (!res.ok) throw new ToolError(`The page returned ${res.status}.`);

    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) throw new ToolError("That page isn't a readable text or HTML page.");

    const body = await readCapped(res);
    const { title, text } = /html/i.test(type) ? htmlToText(body) : { title: "", text: body.trim() };
    return { url: url.toString(), title: title || url.hostname, text: text.slice(0, MAX_CHARS) };
  }
  throw new ToolError("The page redirected too many times.");
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
