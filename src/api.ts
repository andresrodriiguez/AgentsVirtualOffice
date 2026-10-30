import { useEffect, useRef, useState } from "react";
import type { Agent, Layout, OfficeEvent, PermissionDecision, Provider, PublicOffice, Settings } from "../shared/types.ts";

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

export interface Task {
  id: string;
  name: string;
  target: string;
  text: string;
  time: string;
  days: number[];
  enabled: boolean;
  lastRun?: string;
}

export interface Upload {
  name: string;
  mime: string;
  data: string;
}

export interface UsageTotal {
  calls: number;
  input: number;
  output: number;
  cached: number;
  costUsd: number;
}

export const api = {
  office: () => call<PublicOffice>("GET", "/api/office"),
  createAgent: (a: Partial<Agent>) => call<Agent>("POST", "/api/agents", a),
  updateAgent: (id: string, a: Partial<Agent>) => call<Agent>("PUT", `/api/agents/${id}`, a),
  deleteAgent: (id: string) => call<unknown>("DELETE", `/api/agents/${id}`),
  createProvider: (p: Partial<Provider>) => call<unknown>("POST", "/api/providers", p),
  updateProvider: (id: string, p: Partial<Provider>) => call<unknown>("PUT", `/api/providers/${id}`, p),
  deleteProvider: (id: string) => call<unknown>("DELETE", `/api/providers/${id}`),
  saveLayout: (l: Layout) => call<unknown>("PUT", "/api/layout", l),
  send: (text: string, target: string | null, files: Upload[] = []) =>
    call<{ runId: string }>("POST", "/api/message", { text, target, files }),
  reset: (agentId?: string) => call<unknown>("POST", "/api/reset", { agentId }),
  permission: (callId: string, decision: PermissionDecision) => call<unknown>("POST", "/api/permission", { callId, decision }),
  saveSettings: (s: Partial<Settings>) => call<unknown>("PUT", "/api/settings", s),
  ntfy: () => call<{ enabled: boolean; topic: string }>("GET", "/api/ntfy"),
  setNtfy: (enabled: boolean) => call<{ enabled: boolean; topic: string }>("PUT", "/api/ntfy", { enabled }),
  testNtfy: () => call<unknown>("POST", "/api/ntfy/test"),
  tasks: () => call<Task[]>("GET", "/api/tasks"),
  createTask: (t: Partial<Task>) => call<Task>("POST", "/api/tasks", t),
  updateTask: (id: string, t: Partial<Task>) => call<Task>("PUT", `/api/tasks/${id}`, t),
  deleteTask: (id: string) => call<unknown>("DELETE", `/api/tasks/${id}`),
  runTask: (id: string) => call<unknown>("POST", `/api/tasks/${id}/run`),
  usage: () => call<Record<string, UsageTotal>>("GET", "/api/usage"),
  memory: (id: string) => call<{ text: string }>("GET", `/api/agents/${id}/memory`),
  saveMemory: (id: string, text: string) => call<{ text: string }>("PUT", `/api/agents/${id}/memory`, { text }),
  drawLook: (id: string, description: string) => call<unknown>("POST", `/api/agents/${id}/look`, { description }),
  deleteLook: (id: string) => call<unknown>("DELETE", `/api/agents/${id}/look`),
};

export function useOfficeStream(onEvent: (ev: OfficeEvent) => void) {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onEvent);
  handler.current = onEvent;
  useEffect(() => {
    let es: EventSource | null = null;
    let lastSeen = Date.now();
    let closed = false;
    const open = () => {
      es?.close();
      lastSeen = Date.now();
      const next = new EventSource("/api/events");
      es = next;
      next.onopen = () => setConnected(true);
      next.onerror = () => setConnected(false);
      next.onmessage = (m) => {
        lastSeen = Date.now();
        setConnected(true);
        try {
          handler.current(JSON.parse(m.data) as OfficeEvent);
        } catch {
          return;
        }
      };
    };
    open();
    // El servidor manda un ping cada 15 s. Si pasa mucho sin nada (conexión colgada, pestaña dormida,
    // el PC suspendido) se reconecta sola, en vez de obligarte a recargar la página.
    const watchdog = setInterval(() => {
      if (!closed && Date.now() - lastSeen > 40_000) open();
    }, 5_000);
    const wake = () => {
      if (!closed && (document.visibilityState === "visible" || document.visibilityState === undefined) && Date.now() - lastSeen > 20_000) open();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", open);
    window.addEventListener("focus", wake);
    return () => {
      closed = true;
      clearInterval(watchdog);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", open);
      window.removeEventListener("focus", wake);
      es?.close();
    };
  }, []);
  return connected;
}
