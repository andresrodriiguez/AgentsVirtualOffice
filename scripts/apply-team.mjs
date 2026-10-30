#!/usr/bin/env node
// Aplica equipo.json a la oficina que está corriendo: crea o actualiza los proveedores (cuentas)
// y cada persona,
// y borra a quienes no estén en el archivo. Uso: node scripts/apply-team.mjs [equipo.json]
import { readFile } from "node:fs/promises";

const base = process.env.OFFICE_API || "http://127.0.0.1:8787";
const file = process.argv[2] || new URL("../equipo.json", import.meta.url);

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${data.error ?? res.status}`);
  return data;
}

const { agents: wanted, providers: wantedProviders = [] } = JSON.parse(await readFile(file, "utf8"));
const office = await call("GET", "/api/office");
const kept = new Set();

for (const { id, ...fields } of wantedProviders) {
  if (office.providers.some((p) => p.id === id)) await call("PUT", `/api/providers/${id}`, fields);
  else await call("POST", "/api/providers", { id, ...fields });
  console.log(`proveedor: ${fields.name}`);
}

for (const spec of wanted) {
  const { match, ...fields } = spec;
  const existing = office.agents.find((a) => a.id === (match ?? "") || a.name.toLowerCase() === fields.name.toLowerCase());
  if (existing) {
    // Acceso a la PC y carpeta de trabajo se conservan: se configuran aparte, por persona.
    const { tools: _tools, mail: _mail, manager: _manager, imap: _imap, calendar: _calendar, workspace: _workspace, ...update } = fields;
    await call("PUT", `/api/agents/${existing.id}`, update);
    kept.add(existing.id);
    console.log(`actualizado: ${fields.name}`);
  } else {
    const created = await call("POST", "/api/agents", fields);
    kept.add(created.id);
    console.log(`creado: ${fields.name}`);
  }
}
for (const a of office.agents) {
  if (kept.has(a.id)) continue;
  await call("DELETE", `/api/agents/${a.id}`);
  console.log(`eliminado: ${a.name}`);
}
