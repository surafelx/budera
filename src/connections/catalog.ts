// The services a company can connect so agents have what they need. Client-safe: no secrets or server code here.

export const SERVICE_IDS = ["ai_model", "web_search", "stripe", "shopify", "google_analytics"] as const;
export type ServiceId = (typeof SERVICE_IDS)[number];

export type FieldDef = {
  key: string;
  label: string;
  kind: "text" | "url" | "select" | "secret" | "secret_json";
  required: boolean;
  placeholder?: string;
  hint?: string;
  options?: { value: string; label: string }[];
};

export type ServiceDef = {
  id: ServiceId;
  name: string;
  category: "Required" | "Research" | "Business data";
  gives: string;
  setup: string[];
  docsUrl: string;
  fields: FieldDef[];
  /** Environment variables the server can use instead, when the company hasn't connected its own. */
  serverFallback?: string;
};

export const SERVICES: Record<ServiceId, ServiceDef> = {
  ai_model: {
    id: "ai_model",
    name: "AI model",
    category: "Required",
    gives: "The language model every agent thinks and writes with. Any OpenAI-compatible API works: OpenAI, OpenRouter, Groq, Together, Mistral, or a self-hosted server.",
    setup: [
      "Create an API key with your provider (for example platform.openai.com or openrouter.ai/keys).",
      "Pick a model that supports tool calling, so research agents can use their tools.",
      "Paste the provider's base URL, the model name and the key below, then test the connection.",
    ],
    docsUrl: "https://openrouter.ai/docs/quickstart",
    serverFallback: "LLM_BASE_URL, LLM_MODEL, LLM_API_KEY",
    fields: [
      { key: "baseUrl", label: "Base URL", kind: "url", required: true, placeholder: "https://api.openai.com/v1", hint: "The provider's OpenAI-compatible endpoint, ending before /chat/completions." },
      { key: "model", label: "Model", kind: "text", required: true, placeholder: "gpt-4.1-mini" },
      { key: "researchModel", label: "Research model", kind: "text", required: false, placeholder: "Same as the model", hint: "Optional cheaper model for the research tool loop." },
      {
        key: "structuredMode",
        label: "Structured output",
        kind: "select",
        required: true,
        options: [
          { value: "json_schema", label: "JSON schema (OpenAI, most hosted models)" },
          { value: "json_object", label: "JSON mode (models without schema support)" },
        ],
      },
      { key: "apiKey", label: "API key", kind: "secret", required: false, placeholder: "sk-…", hint: "Leave empty only for a local server that needs no key." },
    ],
  },
  web_search: {
    id: "web_search",
    name: "Web search",
    category: "Research",
    gives: "Live search results, so agents research current news, regulations, competitors and prices instead of relying on what the model remembers.",
    setup: [
      "Create an account with Tavily (tavily.com), Brave Search API (brave.com/search/api) or Serper (serper.dev).",
      "Copy the API key from the provider's dashboard.",
      "Choose the provider below, paste the key, and test the connection.",
    ],
    docsUrl: "https://docs.tavily.com/documentation/quickstart",
    serverFallback: "SEARCH_PROVIDER, SEARCH_API_KEY",
    fields: [
      {
        key: "provider",
        label: "Provider",
        kind: "select",
        required: true,
        options: [
          { value: "tavily", label: "Tavily" },
          { value: "brave", label: "Brave Search" },
          { value: "serper", label: "Serper (Google results)" },
        ],
      },
      { key: "apiKey", label: "API key", kind: "secret", required: true, placeholder: "tvly-…" },
    ],
  },
  stripe: {
    id: "stripe",
    name: "Stripe",
    category: "Business data",
    gives: "Real revenue: payments by month, refunds, failed charges, paying customers and active subscriptions for the last 90 days.",
    setup: [
      "In the Stripe Dashboard, open Developers → API keys → Create restricted key.",
      "Give it Read access to Charges, Customers and Subscriptions, and nothing else.",
      "Paste the restricted key (rk_live_… or rk_test_…) below and test the connection.",
    ],
    docsUrl: "https://docs.stripe.com/keys#create-restricted-api-secret-key",
    fields: [{ key: "secretKey", label: "Restricted API key", kind: "secret", required: true, placeholder: "rk_live_…", hint: "Read-only restricted keys are strongly recommended." }],
  },
  shopify: {
    id: "shopify",
    name: "Shopify",
    category: "Business data",
    gives: "Store performance: orders, revenue, average order value, repeat customers, refunds and how long orders take to fulfil.",
    setup: [
      "In Shopify admin, open Settings → Apps and sales channels → Develop apps → Create an app.",
      "Under Admin API scopes, allow read_orders only, then install the app.",
      "Copy the Admin API access token (shown once) and your store's myshopify.com domain.",
    ],
    docsUrl: "https://help.shopify.com/en/manual/apps/app-types/custom-apps",
    fields: [
      { key: "shopDomain", label: "Store domain", kind: "text", required: true, placeholder: "your-store.myshopify.com" },
      { key: "accessToken", label: "Admin API access token", kind: "secret", required: true, placeholder: "shpat_…" },
    ],
  },
  google_analytics: {
    id: "google_analytics",
    name: "Google Analytics 4",
    category: "Business data",
    gives: "Website traffic: sessions, users and key events by channel, so agents see which marketing actually brings people in.",
    setup: [
      "In Google Cloud, create a service account and enable the Google Analytics Data API for its project.",
      "Create a JSON key for the service account and download it.",
      "In Google Analytics, open Admin → Property access management and add the service account's email as a Viewer.",
      "Paste the property ID (Admin → Property details) and the whole JSON key below.",
    ],
    docsUrl: "https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart-client-libraries",
    fields: [
      { key: "propertyId", label: "Property ID", kind: "text", required: true, placeholder: "123456789" },
      { key: "serviceAccountJson", label: "Service account JSON key", kind: "secret_json", required: true, placeholder: '{ "type": "service_account", … }' },
    ],
  },
};

export type Need = "required" | "recommended" | "optional";
export type ServiceNeed = { service: ServiceId; need: Need; why: string };

/** What a connection looks like to the browser. Secrets never leave the server; only their last characters do. */
export type ConnectionView = {
  service: ServiceId;
  config: Record<string, string>;
  secretHints: Record<string, string>;
  status: "untested" | "ok" | "error" | "demo";
  statusMessage: string;
  checkedAt: string | null;
};
