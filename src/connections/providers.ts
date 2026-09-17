import { createSign } from "node:crypto";
import { ToolError } from "@/tools/search";

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Business data an agent can pull. Each returns plain-text facts for the model, and has a cheap connection test. */
export type DataSource = {
  summary(days: number): Promise<string>;
  test(): Promise<string>;
};

const DAY = 86_400_000;
const clampDays = (days: unknown) => Math.min(365, Math.max(7, Math.round(Number(days) || 90)));

async function call(fetchImpl: FetchLike, service: string, url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, redirect: "error", signal: AbortSignal.timeout(25_000) });
  } catch {
    throw new ToolError(`Couldn't reach ${service}.`);
  }
  if (res.status === 401) throw new ToolError(`${service} rejected the credentials.`);
  if (res.status === 403) throw new ToolError(`${service} credentials are valid but lack permission for this data.`);
  if (res.status === 404) throw new ToolError(`${service} couldn't find that account or property.`);
  if (res.status === 429) throw new ToolError(`${service} is rate-limiting requests. Try again shortly.`);
  if (!res.ok) throw new ToolError(`${service} returned an error (${res.status}).`);
  return res;
}

const money = (amount: number, currency: string) => `${(amount / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })} ${currency.toUpperCase()}`;
const monthOf = (d: Date) => d.toISOString().slice(0, 7);

/* ---------------- Stripe ---------------- */

type StripeCharge = { id: string; amount: number; amount_refunded: number; currency: string; status: string; paid: boolean; created: number; customer: string | null; billing_details?: { email?: string | null } };
type StripeSubscription = { items: { data: { quantity?: number; price: { unit_amount: number | null; currency: string; recurring: { interval: string; interval_count: number } | null } }[] } };

export function stripeSource(secretKey: string, fetchImpl: FetchLike = fetch): DataSource {
  const get = async <T,>(path: string) =>
    (await (await call(fetchImpl, "Stripe", `https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${secretKey}` } })).json()) as T;

  return {
    async test() {
      await get("charges?limit=1");
      return "Connected. Stripe returned your charges.";
    },

    async summary(rawDays) {
      const days = clampDays(rawDays);
      const since = Math.floor((Date.now() - days * DAY) / 1000);
      const charges: StripeCharge[] = [];
      let after = "";
      for (let page = 0; page < 5; page++) {
        const data = await get<{ data: StripeCharge[]; has_more: boolean }>(`charges?limit=100&created[gte]=${since}${after ? `&starting_after=${after}` : ""}`);
        charges.push(...data.data);
        if (!data.has_more || data.data.length === 0) break;
        after = data.data[data.data.length - 1].id;
      }

      const ok = charges.filter((c) => c.status === "succeeded" && c.paid);
      const failed = charges.filter((c) => c.status === "failed");
      const currency = ok[0]?.currency ?? charges[0]?.currency ?? "usd";
      const gross = ok.filter((c) => c.currency === currency).reduce((s, c) => s + c.amount, 0);
      const refunded = ok.filter((c) => c.currency === currency).reduce((s, c) => s + c.amount_refunded, 0);
      const customers = new Map<string, number>();
      for (const c of ok) {
        const who = c.customer ?? c.billing_details?.email ?? "";
        if (who) customers.set(who, (customers.get(who) ?? 0) + 1);
      }
      const repeat = [...customers.values()].filter((n) => n > 1).length;
      const byMonth = new Map<string, number>();
      for (const c of ok) if (c.currency === currency) byMonth.set(monthOf(new Date(c.created * 1000)), (byMonth.get(monthOf(new Date(c.created * 1000))) ?? 0) + c.amount);

      const lines = [
        `Stripe, last ${days} days${charges.length >= 500 ? " (first 500 charges only)" : ""}:`,
        `- Successful payments: ${ok.length}, gross ${money(gross, currency)}, refunded ${money(refunded, currency)} (${gross ? Math.round((refunded / gross) * 100) : 0}%).`,
        `- Failed payments: ${failed.length} (${charges.length ? Math.round((failed.length / charges.length) * 100) : 0}% of attempts).`,
        `- Paying customers: ${customers.size}, of whom ${repeat} paid more than once.`,
        `- Revenue by month: ${[...byMonth.entries()].sort().map(([m, v]) => `${m} ${money(v, currency)}`).join("; ") || "none"}.`,
      ];

      try {
        const subs = await get<{ data: StripeSubscription[] }>("subscriptions?status=active&limit=100");
        let mrr = 0;
        for (const sub of subs.data) {
          for (const item of sub.items.data) {
            const r = item.price.recurring;
            if (!r || item.price.unit_amount == null || item.price.currency !== currency) continue;
            const perMonth = r.interval === "year" ? 1 / 12 : r.interval === "week" ? 52 / 12 : r.interval === "day" ? 365 / 12 : 1;
            mrr += (item.price.unit_amount * (item.quantity ?? 1) * perMonth) / r.interval_count;
          }
        }
        lines.push(`- Active subscriptions: ${subs.data.length}${subs.data.length === 100 ? "+" : ""}, about ${money(mrr, currency)} monthly recurring revenue.`);
      } catch (error) {
        lines.push(`- Subscriptions: not available (${error instanceof ToolError ? error.message : "request failed"}).`);
      }
      return lines.join("\n");
    },
  };
}

/* ---------------- Shopify ---------------- */

export const SHOPIFY_DOMAIN = /^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/;
const SHOPIFY_API = "2025-01";

type ShopifyOrder = {
  created_at: string;
  total_price: string;
  currency: string;
  financial_status: string | null;
  fulfillment_status: string | null;
  cancelled_at: string | null;
  customer?: { id: number } | null;
  refunds?: unknown[];
  fulfillments?: { created_at: string }[];
};

export function shopifySource(shopDomain: string, accessToken: string, fetchImpl: FetchLike = fetch): DataSource {
  const domain = shopDomain.trim().toLowerCase();
  if (!SHOPIFY_DOMAIN.test(domain)) throw new ToolError("The Shopify store domain must look like your-store.myshopify.com.");
  const headers = { "X-Shopify-Access-Token": accessToken, Accept: "application/json" };

  return {
    async test() {
      const res = await call(fetchImpl, "Shopify", `https://${domain}/admin/api/${SHOPIFY_API}/shop.json`, { headers });
      const shop = ((await res.json()) as { shop?: { name?: string } }).shop;
      return `Connected to ${shop?.name ?? domain}.`;
    },

    async summary(rawDays) {
      const days = clampDays(rawDays);
      const since = new Date(Date.now() - days * DAY).toISOString();
      const fields = "created_at,total_price,currency,financial_status,fulfillment_status,cancelled_at,customer,refunds,fulfillments";
      let url: string | null = `https://${domain}/admin/api/${SHOPIFY_API}/orders.json?status=any&limit=250&created_at_min=${encodeURIComponent(since)}&fields=${fields}`;
      const orders: ShopifyOrder[] = [];
      for (let page = 0; page < 4 && url; page++) {
        const res: Response = await call(fetchImpl, "Shopify", url, { headers });
        orders.push(...((await res.json()) as { orders: ShopifyOrder[] }).orders);
        const next: string | undefined = res.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
        url = next && new URL(next).host === domain ? next : null;
      }

      const live = orders.filter((o) => !o.cancelled_at);
      const currency = live[0]?.currency ?? "USD";
      const revenue = live.reduce((s, o) => s + Number(o.total_price || 0), 0);
      const perCustomer = new Map<number, number>();
      for (const o of live) if (o.customer?.id) perCustomer.set(o.customer.id, (perCustomer.get(o.customer.id) ?? 0) + 1);
      const repeatBuyers = [...perCustomer.values()].filter((n) => n > 1).length;
      const unfulfilled = live.filter((o) => !o.fulfillment_status && o.financial_status === "paid").length;
      const refunded = live.filter((o) => (o.refunds?.length ?? 0) > 0).length;
      const fulfilHours = live
        .filter((o) => o.fulfillments?.length)
        .map((o) => (new Date(o.fulfillments![0].created_at).getTime() - new Date(o.created_at).getTime()) / 3_600_000)
        .filter((h) => h >= 0)
        .sort((a, b) => a - b);
      const median = fulfilHours.length ? fulfilHours[Math.floor(fulfilHours.length / 2)] : null;
      const byMonth = new Map<string, number>();
      for (const o of live) byMonth.set(monthOf(new Date(o.created_at)), (byMonth.get(monthOf(new Date(o.created_at))) ?? 0) + 1);

      return [
        `Shopify, last ${days} days${orders.length >= 1000 ? " (first 1,000 orders only)" : ""}:`,
        `- Orders: ${live.length} (${orders.length - live.length} cancelled), revenue ${Math.round(revenue).toLocaleString("en-US")} ${currency}, average order ${live.length ? (revenue / live.length).toFixed(2) : "0"} ${currency}.`,
        `- Customers: ${perCustomer.size}, of whom ${repeatBuyers} ordered more than once (${perCustomer.size ? Math.round((repeatBuyers / perCustomer.size) * 100) : 0}%).`,
        `- Orders with refunds: ${refunded}. Paid but unfulfilled right now: ${unfulfilled}.`,
        `- Median time to first fulfilment: ${median == null ? "unknown" : median < 48 ? `${Math.round(median)} hours` : `${(median / 24).toFixed(1)} days`}.`,
        `- Orders by month: ${[...byMonth.entries()].sort().map(([m, n]) => `${m} ${n}`).join("; ") || "none"}.`,
      ].join("\n");
    },
  };
}

/* ---------------- Google Analytics 4 ---------------- */

type ServiceAccount = { client_email: string; private_key: string };

export function parseServiceAccount(json: string): ServiceAccount {
  let parsed: Partial<ServiceAccount> & { type?: string };
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ToolError("The service account key isn't valid JSON. Paste the whole downloaded file.");
  }
  if (!parsed.client_email || !parsed.private_key?.includes("PRIVATE KEY")) {
    throw new ToolError("The JSON must be a service account key with client_email and private_key.");
  }
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

export function analyticsSource(propertyId: string, serviceAccountJson: string, fetchImpl: FetchLike = fetch): DataSource {
  if (!/^\d{5,15}$/.test(propertyId.trim())) throw new ToolError("The Google Analytics property ID is a number, like 123456789.");
  const account = parseServiceAccount(serviceAccountJson);
  const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");

  async function token(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: account.client_email, scope: "https://www.googleapis.com/auth/analytics.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
    let signature: string;
    try {
      signature = createSign("RSA-SHA256").update(unsigned).sign(account.private_key, "base64url");
    } catch {
      throw new ToolError("The service account's private key couldn't be used. Download a fresh JSON key.");
    }
    // Always Google's token endpoint, never a URL taken from the pasted JSON.
    const res = await call(fetchImpl, "Google", "https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }).toString(),
    });
    return ((await res.json()) as { access_token: string }).access_token;
  }

  async function report(body: object) {
    const res = await call(fetchImpl, "Google Analytics", `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId.trim()}:runReport`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as { rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[]; totals?: { metricValues: { value: string }[] }[] };
  }

  return {
    async test() {
      await report({ dateRanges: [{ startDate: "7daysAgo", endDate: "today" }], metrics: [{ name: "sessions" }], limit: 1 });
      return `Connected. Google Analytics returned data for property ${propertyId.trim()}.`;
    },

    async summary(rawDays) {
      const days = clampDays(rawDays);
      const data = await report({
        dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "keyEvents" }, { name: "engagementRate" }],
        metricAggregations: ["TOTAL"],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 10,
      });
      const total = data.totals?.[0]?.metricValues.map((m) => Number(m.value)) ?? [0, 0, 0, 0];
      const channels = (data.rows ?? []).map((r) => {
        const [sessions, users, keyEvents, engagement] = r.metricValues.map((m) => Number(m.value));
        return `${r.dimensionValues[0].value}: ${sessions} sessions, ${users} users, ${keyEvents} key events, ${Math.round(engagement * 100)}% engaged`;
      });
      return [
        `Google Analytics 4, last ${days} days:`,
        `- Total: ${total[0]} sessions, ${total[1]} users, ${total[2]} key events (${total[0] ? ((total[2] / total[0]) * 100).toFixed(1) : "0"}% of sessions).`,
        `- By channel: ${channels.join("; ") || "no traffic recorded"}.`,
      ].join("\n");
    },
  };
}
