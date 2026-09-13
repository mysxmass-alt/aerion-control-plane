export const runtimeTemplates = [
  { id: "node-22", name: "Node.js 22", slug: "nodejs", description: "Long-running JavaScript bots, Discord workers, Telegram bots, and API services.", image: "node:22-bookworm", command: "npm start", accent: "cyan", tags: ["Node.js", "npm", "WebSocket"] },
  { id: "python-3-12", name: "Python 3.12", slug: "python", description: "Python automation, webhooks, workers, scrapers, and data tasks.", image: "python:3.12-slim", command: "python main.py", accent: "amber", tags: ["Python", "pip", "FastAPI"] },
  { id: "web-hosting", name: "Web Hosting", slug: "web-hosting", description: "Deploy a static website and connect it to a managed Aerion domain.", image: "nginx:alpine", command: "nginx -g 'daemon off;'", accent: "violet", tags: ["Static sites", "Domains", "HTTPS"] },
] as const;

export const billingPlans = [
  { id: "free", name: "Starter", priceCents: 0, cpu: 0.25, memoryMb: 512, diskGb: 5, servers: 1, description: "Try Aerion with one lightweight bot." },
  { id: "builder", name: "Builder", priceCents: 900, cpu: 1, memoryMb: 2048, diskGb: 25, servers: 3, description: "For multiple production automations." },
  { id: "scale", name: "Scale", priceCents: 2900, cpu: 2, memoryMb: 8192, diskGb: 100, servers: 10, description: "For teams running a serious bot fleet." },
] as const;

export type RuntimeTemplate = (typeof runtimeTemplates)[number];
export type BillingPlan = (typeof billingPlans)[number];
export const allowedRuntimeSlugs = ["nodejs", "python", "web-hosting"] as const;
export type AllowedRuntimeSlug = (typeof allowedRuntimeSlugs)[number];
