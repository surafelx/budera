// Tool names and labels only. Safe to import from client components; the tool implementations live in ./index.
import type { ServiceId } from "@/connections/catalog";

export const TOOL_IDS = ["web_search", "read_page", "stripe_revenue", "shopify_sales", "analytics_traffic"] as const;
export type ToolId = (typeof TOOL_IDS)[number];

export const TOOL_INFO: Record<ToolId, { label: string; description: string; service: ServiceId | null }> = {
  web_search: { label: "Search the web", description: "Look up current news, companies, prices and trends.", service: "web_search" },
  read_page: { label: "Read web pages", description: "Open a page, such as a competitor's pricing page, and read it.", service: null },
  stripe_revenue: { label: "Stripe revenue", description: "Payments, refunds, failed charges and subscriptions from your Stripe account.", service: "stripe" },
  shopify_sales: { label: "Shopify sales", description: "Orders, repeat customers, refunds and fulfilment times from your store.", service: "shopify" },
  analytics_traffic: { label: "Website traffic", description: "Visitors, channels and key events from Google Analytics 4.", service: "google_analytics" },
};

export type Source = { url: string; title: string };
