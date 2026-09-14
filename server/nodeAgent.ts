import { ENV } from "./_core/env";

function config() {
  if (!ENV.nodeAgentUrl || !ENV.nodeAgentToken) throw new Error("Node agent is not configured");
  return { url: ENV.nodeAgentUrl.replace(/\/+$/, ""), token: ENV.nodeAgentToken };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, token } = config();
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers || {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Node agent request failed (${response.status})`);
  return body as T;
}

export type NodeServer = { name: string; status: string; running: boolean; image?: string; memoryMb?: number; cpu?: number };

export function nodeHealth() {
  return request<{ ok: boolean; service: string; version: string }>("/health");
}
export function listNodeServers() {
  return request<{ servers: NodeServer[] }>("/v1/servers");
}
export function createNodeServer(input: { name: string; runtime: string; memoryMb: number; cpu: number }) {
  return request<NodeServer>(`/v1/servers/${encodeURIComponent(input.name)}`, { method: "POST", body: JSON.stringify(input) });
}
export function updateNodeResources(name: string, input: { memoryMb: number; cpu: number }) {
  return request<NodeServer>(`/v1/servers/${encodeURIComponent(name)}/resources`, { method: "PATCH", body: JSON.stringify(input) });
}
export function nodeAction(name: string, action: "start" | "stop" | "restart") {
  return request<NodeServer>(`/v1/servers/${encodeURIComponent(name)}/${action}`, { method: "POST" });
}
export function nodeLogs(name: string) {
  return request<{ logs: string }>(`/v1/servers/${encodeURIComponent(name)}/logs`);
}
export function nodeStats(name: string) {
  return request<Record<string, unknown>>(`/v1/servers/${encodeURIComponent(name)}/stats`);
}
export function nodeUploadFile(name: string, filePath: string, data: Buffer) {
  return request<{ success: boolean; path: string; size: number }>(`/v1/servers/${encodeURIComponent(name)}/files/upload`, {
    method: "POST",
    body: JSON.stringify({ path: filePath, dataBase64: data.toString("base64") }),
  });
}
export function nodeListFiles(name: string) {
  return request<{ files: Array<{ path: string; name: string; type: "file"; size: number; modifiedAt: string }> }>(`/v1/servers/${encodeURIComponent(name)}/files`);
}
export function nodeFileAction(name: string, input: { action: "move" | "rename" | "copy" | "delete"; source: string; destination?: string }) {
  return request<{ success: boolean }>(`/v1/servers/${encodeURIComponent(name)}/files/action`, { method: "POST", body: JSON.stringify(input) });
}
export function nodeExtractZip(name: string, archive: string) {
  return request<{ success: boolean }>(`/v1/servers/${encodeURIComponent(name)}/extract`, {
    method: "POST",
    body: JSON.stringify({ archive }),
  });
}
export function deleteNodeServer(name: string) {
  return request<{ success: boolean }>(`/v1/servers/${encodeURIComponent(name)}`, { method: "DELETE" });
}
export function nodeStartup(name: string) {
  return request<{ runtime: string; command: string; env: Record<string, string> }>(`/v1/servers/${encodeURIComponent(name)}/startup`);
}
export function updateNodeStartup(name: string, input: { runtime: string; command: string; env: Record<string, string> }) {
  return request<Record<string, unknown>>(`/v1/servers/${encodeURIComponent(name)}/startup`, { method: "PUT", body: JSON.stringify(input) });
}
export function nodeCommand(name: string, command: string) {
  return request<{ output: string }>(`/v1/servers/${encodeURIComponent(name)}/command`, { method: "POST", body: JSON.stringify({ command }) });
}
