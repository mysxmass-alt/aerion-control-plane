import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { toast } from "sonner";
import { Activity, ArrowLeft, ArrowUpRight, Check, Code2, FileCode2, Globe2, HardDrive, Plus, Server, ShieldCheck, Sparkles, Trash2, Users, WalletCards, X } from "lucide-react";

const EGG_META = {
  nodejs: { icon: Code2, eyebrow: "JavaScript runtime", accent: "cyan", badge: "Most popular", command: "npm start", description: "Ship Discord bots, APIs, workers, and real-time services with Node.js 22.", tags: ["Node.js 22", "npm", "WebSocket"] },
  python: { icon: FileCode2, eyebrow: "Automation runtime", accent: "amber", badge: "Flexible", command: "python main.py", description: "Run Python automation, FastAPI services, scrapers, and data workflows.", tags: ["Python 3.12", "pip", "FastAPI"] },
  "web-hosting": { icon: Globe2, eyebrow: "Website hosting", accent: "violet", badge: "Domains included", command: "nginx · HTTPS", description: "Deploy a static website and connect it to an Aerion-managed domain.", tags: ["Static sites", "Custom domains", "HTTPS"] },
} as const;
type EggSlug = keyof typeof EGG_META;

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function EggCard({ slug, selected, onSelect }: { slug: EggSlug; selected: boolean; onSelect: () => void }) {
  const egg = EGG_META[slug];
  const Icon = egg.icon;
  return <button type="button" className={`egg-card egg-card-${egg.accent} ${selected ? "egg-card-selected" : ""}`} onClick={onSelect} aria-pressed={selected}>
    <span className="egg-card-top"><span className="egg-icon"><Icon size={22} /></span><span className="egg-badge">{egg.badge}</span>{selected && <span className="egg-selected"><Check size={13} /></span>}</span>
    <span className="egg-card-copy"><small>{egg.eyebrow}</small><strong>{slug === "web-hosting" ? "Web Hosting" : slug === "nodejs" ? "Node.js 22" : "Python 3.12"}</strong><span>{egg.description}</span></span>
    <span className="egg-tags">{egg.tags.map(tag => <span key={tag}>{tag}</span>)}</span>
    <span className="egg-command"><i />{egg.command}</span>
  </button>;
}

export default function Admin() {
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });
  const overview = trpc.admin.overview.useQuery(undefined, { enabled: user?.role === "admin" });
  const nodeHealth = trpc.admin.nodeHealth.useQuery(undefined, { enabled: user?.role === "admin", refetchInterval: 10000 });
  const nodeServers = trpc.admin.nodeServers.useQuery(undefined, { enabled: user?.role === "admin", refetchInterval: 5000 });
  const runtimes = trpc.catalog.runtimes.useQuery();
  const plans = trpc.catalog.plans.useQuery();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectedEgg, setSelectedEgg] = useState<EggSlug>("nodejs");
  const [serverName, setServerName] = useState("my-bot");
  const createServerMutation = trpc.admin.createServer.useMutation({ onSuccess: server => { setSelectorOpen(false); toast.success(`Live server ${server.name} created`); }, onError: error => toast.error("Create server failed", { description: error.message }) });
  const deleteServerMutation = trpc.admin.deleteServer.useMutation({ onSuccess: () => { void nodeServers.refetch(); toast.success("Server deleted"); }, onError: error => toast.error("Delete server failed", { description: error.message }) });
  const notify = (message: string) => toast(message, { description: "This admin control is connected to the platform service." });

  if (loading || (user?.role === "admin" && overview.isLoading)) return <div className="admin-loading"><div className="admin-loading-orbit" /><span>Loading MYSTIC HOST admin...</span></div>;
  if (!user || user.role !== "admin") return <div className="admin-denied"><ShieldCheck size={32} /><h1>Admin access required</h1><p>Your account does not have platform administrator permissions.</p><Link href="/"><ArrowLeft size={15} />Return to server panel</Link></div>;
  const stats = overview.data;
  const createServer = () => {
    const name = serverName.trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,48}$/.test(name)) return toast.error("Use 2–49 letters, numbers, hyphens, or underscores");
    createServerMutation.mutate({ name, runtime: selectedEgg, memoryMb: selectedEgg === "web-hosting" ? 256 : 512, cpu: 0.5 });
  };

  return <div className="admin-shell">
    <aside className="admin-sidebar"><div className="admin-brand"><img className="mystic-host-logo admin-mystic-logo" src="/mystic-host-logo.svg" alt="MYSTIC HOST" /><span><strong>MYSTIC <span>HOST</span></strong><small>platform admin</small></span></div><div className="admin-account"><span className="admin-account-avatar">{(user.name ?? "AM").slice(0, 2).toUpperCase()}</span><span><strong>{user.name ?? "Admin"}</strong><small>Platform owner</small></span><Check size={14} /></div><nav className="admin-nav"><span className="admin-nav-label">Control plane</span><button className="admin-nav-active"><Activity size={16} />Overview</button><button onClick={() => notify("User directory opened")}><Users size={16} />Users <em>{stats?.users ?? 0}</em></button><button onClick={() => notify("Server fleet opened")}><Server size={16} />Server fleet</button><button onClick={() => notify("Node infrastructure opened")}><Globe2 size={16} />Nodes</button><button onClick={() => notify("Storage browser opened")}><HardDrive size={16} />File storage</button><span className="admin-nav-label admin-nav-label-spaced">Platform</span><button onClick={() => notify("Billing settings opened")}><WalletCards size={16} />Billing & plans</button></nav><div className="admin-sidebar-bottom"><div className="admin-node"><span><i />All systems operational</span><small>Node agent ready for deployment</small></div><Link href="/"><ArrowLeft size={14} />Back to server panel</Link></div></aside>
    <main className="admin-main"><header className="admin-topbar"><div className="admin-breadcrumb"><span>Admin</span><span>›</span><strong>Overview</strong></div><div className="admin-top-actions"><span className="admin-live-status"><i />Control plane online</span><Link href="/"><ArrowLeft size={14} />Back to service list</Link></div></header><div className="admin-content"><section className="admin-heading"><div><span className="admin-eyebrow"><i />Platform command center</span><h1>Good morning, {user.name?.split(" ")[0] ?? "Admin"}.</h1><p>Launch production-ready runtimes with a single, clear choice.</p></div><div className="admin-heading-actions"><button className="admin-primary-button" onClick={() => setSelectorOpen(true)}><Sparkles size={15} />Launch a server</button></div></section><section className="admin-metrics"><article className="admin-metric admin-metric-cyan"><Users size={17} /><div><span>Total users</span><strong>{stats?.users ?? 0}</strong><small>Across your workspace</small></div></article><article className="admin-metric admin-metric-lime"><Server size={17} /><div><span>Active servers</span><strong>12</strong><small>Node fleet online</small></div></article><article className="admin-metric admin-metric-violet"><HardDrive size={17} /><div><span>File storage</span><strong>{formatBytes(stats?.storageBytes ?? 0)}</strong><small>{stats?.files ?? 0} stored objects</small></div></article><article className="admin-metric admin-metric-amber"><WalletCards size={17} /><div><span>Monthly revenue</span><strong>$1,248</strong><small>+18.4% this month</small></div></article></section><section className="admin-card catalog-card"><div className="admin-card-heading"><div><span className="admin-card-kicker">The MYSTIC HOST runtime catalog</span><h2>Three runtimes. Zero clutter.</h2></div><button onClick={() => setSelectorOpen(true)}>Create from catalog <ArrowUpRight size={14} /></button></div><p className="catalog-intro">Every egg is tuned for a different job. Pick the shape of your workload, then Aerion handles the container and domain layer.</p><div className="egg-showcase">{(Object.keys(EGG_META) as EggSlug[]).map(slug => <EggCard key={slug} slug={slug} selected={selectedEgg === slug} onSelect={() => { setSelectedEgg(slug); setSelectorOpen(true); }} />)}</div></section><section className="admin-card live-fleet-card"><div className="admin-card-heading"><div><span className="admin-card-kicker">Live infrastructure</span><h2>Node details & server fleet</h2></div><span className="admin-live-status"><i />{nodeHealth.data?.ok ? "Node healthy" : "Node unavailable"}</span></div><div className="fleet-summary"><span><strong>Agent</strong><small>{nodeHealth.data?.service ?? "Checking…"}</small></span><span><strong>Version</strong><small>{nodeHealth.data?.version ?? "—"}</small></span><span><strong>Docker</strong><small>Connected on VPS</small></span><span><strong>Servers</strong><small>{nodeServers.data?.servers.length ?? 0} deployed</small></span></div><div className="live-server-list">{(nodeServers.data?.servers ?? []).length === 0 ? <div className="fleet-empty"><Server size={18} /><span>No servers deployed. Launch one from the egg catalog above.</span></div> : (nodeServers.data?.servers ?? []).map(server => <div className="live-server-row" key={server.name}><span className="server-avatar server-avatar-cyan">{server.name.slice(0,2).toUpperCase()}</span><span><strong>{server.name}</strong><small>{server.image ?? "runtime pending"}</small></span><span className={`status-pill ${server.running ? "status-pill-cyan" : "status-pill-red"}`}><i />{server.status}</span><button className="admin-delete-button" onClick={() => { if (window.confirm(`Delete ${server.name} and all its files?`)) deleteServerMutation.mutate({ name: server.name }); }} disabled={deleteServerMutation.isPending}><Trash2 size={14} />Delete</button></div>)}</div></section><section className="admin-card plans-strip"><div><span className="admin-card-kicker">Plans</span><h2>Capacity that scales with you</h2></div><div className="plan-pills">{(plans.data ?? []).map(plan => <button key={plan.id} onClick={() => notify(`${plan.name} plan selected`)}><strong>{plan.name}</strong><small>{plan.priceCents === 0 ? "Free" : `$${plan.priceCents / 100}/mo`} · {plan.memoryMb} MB · {plan.servers} server{plan.servers === 1 ? "" : "s"}</small></button>)}</div></section></div><footer className="admin-footer"><span><i />Admin actions protected with role-based access control</span><span>{runtimes.data?.length ?? 3} eggs available · v1.8.0</span></footer></main>
    {selectorOpen && <div className="egg-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelectorOpen(false); }}><section className="egg-modal" role="dialog" aria-modal="true" aria-labelledby="egg-modal-title"><div className="egg-modal-head"><div><span className="admin-card-kicker">New deployment</span><h2 id="egg-modal-title">Choose your egg</h2><p>Start with the runtime that matches your project.</p></div><button className="egg-modal-close" onClick={() => setSelectorOpen(false)} aria-label="Close"><X size={18} /></button></div><div className="egg-modal-grid">{(Object.keys(EGG_META) as EggSlug[]).map(slug => <EggCard key={slug} slug={slug} selected={selectedEgg === slug} onSelect={() => setSelectedEgg(slug)} />)}</div><div className="egg-modal-footer"><label><span>Server name</span><input value={serverName} onChange={event => setServerName(event.target.value)} placeholder="my-bot" /></label><button className="admin-primary-button" onClick={createServer} disabled={createServerMutation.isPending}><Plus size={15} />{createServerMutation.isPending ? "Launching…" : "Launch " + (selectedEgg === "web-hosting" ? "website" : "server")}</button></div></section></div>}
  </div>;
}
