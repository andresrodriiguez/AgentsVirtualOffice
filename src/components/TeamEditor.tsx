import { useEffect, useState } from "react";
import type { Agent, Appearance, PublicOffice } from "../../shared/types.ts";
import { api } from "../api.ts";
import { PALETTES, randomAppearance } from "../office/sprites.ts";
import { SpritePreview } from "./SpritePreview.tsx";

const ACCESSORIES: NonNullable<Appearance["accessory"]>[] = ["none", "glasses", "headphones"];
const STYLE_LABEL: Record<Appearance["hairStyle"], string> = {
  short: "corto",
  long: "largo",
  bun: "rodete",
  cap: "gorra",
  curly: "rulos",
  bald: "pelado",
};
const ACC_LABEL = { none: "nada", glasses: "anteojos", headphones: "auriculares" };

function Swatches({ colors, value, onPick }: { colors: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div className="swatches">
      {colors.map((c) => (
        <button key={c} className={c === value ? "on" : ""} style={{ background: c }} onClick={() => onPick(c)} aria-label={c} />
      ))}
      <input type="color" value={value} onChange={(e) => onPick(e.target.value)} />
    </div>
  );
}

export type LookProgress = Record<string, { status: "drawing" | "done" | "error"; error?: string }>;

function LookPanel({ agent, office, progress, onError }: { agent: Agent; office: PublicOffice; progress?: LookProgress[string]; onError: (m: string) => void }) {
  const [desc, setDesc] = useState(agent.look?.description ?? "");
  const drawing = progress?.status === "drawing";
  const canDraw = !!office.settings?.imageProviderId && !!office.settings?.imageModel;
  return (
    <div className="look-panel">
      <label>
        Dibujar con IA: describe cómo se ve
        <textarea
          rows={2}
          value={desc}
          placeholder="ej: mujer de pelo rojo largo, buzo verde, jeans y zapatillas"
          onChange={(e) => setDesc(e.target.value)}
        />
      </label>
      <div className="card-actions">
        <button
          disabled={!desc.trim() || drawing || !canDraw}
          title={canDraw ? "" : "Configura un modelo de imágenes en Modelos → Ajustes"}
          onClick={async () => {
            try {
              await api.drawLook(agent.id, desc.trim());
            } catch (e) {
              onError((e as Error).message);
            }
          }}
        >
          {drawing ? "Dibujando… (≈20 s)" : agent.look ? "🎨 Redibujar" : "🎨 Dibujar con IA"}
        </button>
        {agent.look && !drawing && (
          <button
            className="ghost"
            onClick={async () => {
              try {
                await api.deleteLook(agent.id);
              } catch (e) {
                onError((e as Error).message);
              }
            }}
          >
            Volver al pixel simple
          </button>
        )}
        {!canDraw && <small className="hint">Falta elegir el modelo de imágenes en 🔌 Modelos → Ajustes.</small>}
        {progress?.status === "error" && <small className="error">No se pudo dibujar: {progress.error}</small>}
      </div>
    </div>
  );
}

function MemoryPanel({ agent, onError }: { agent: Agent; onError: (m: string) => void }) {
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const load = () =>
    api
      .memory(agent.id)
      .then((m) => {
        setText(m.text);
        setSaved(m.text);
      })
      .catch((e) => onError((e as Error).message));
  return (
    <details onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && load()}>
      <summary>Memoria {text ? `· ${text.length} caracteres` : ""}</summary>
      <p className="hint">
        Lo que {agent.name} recuerda entre conversaciones. Él mismo la va escribiendo; puedes corregirla aquí. Se guarda en{" "}
        <code>data/agentes/{agent.id}/memoria.md</code>.
      </p>
      <textarea rows={8} value={text ?? ""} placeholder="(vacía)" onChange={(e) => setText(e.target.value)} />
      <div className="card-actions">
        <span className="spacer" />
        <button
          disabled={text === null || text === saved}
          onClick={() =>
            api
              .saveMemory(agent.id, text ?? "")
              .then((m) => {
                setText(m.text);
                setSaved(m.text);
              })
              .catch((e) => onError((e as Error).message))
          }
        >
          Guardar memoria
        </button>
      </div>
    </details>
  );
}

function AgentCard({ agent, office, progress, onError }: { agent: Agent; office: PublicOffice; progress?: LookProgress[string]; onError: (m: string) => void }) {
  const [draft, setDraft] = useState(agent);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(agent), [agent]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(agent);
  const set = <K extends keyof Agent>(k: K, v: Agent[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const look = (k: keyof Appearance, v: string) => setDraft((d) => ({ ...d, appearance: { ...d.appearance, [k]: v } }));
  const provider = office.providers.find((p) => p.id === draft.providerId);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateAgent(agent.id, draft);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="agent-card" style={{ ["--c" as string]: draft.appearance.shirt }}>
      <div className="agent-look">
        <SpritePreview agent={draft} scale={4} />
        {!agent.look && (
          <button className="ghost" onClick={() => set("appearance", randomAppearance(`${draft.name}-${Date.now()}`))}>
            🎲 otro look
          </button>
        )}
      </div>
      <div className="agent-fields">
        <div className="row2">
          <label>
            Nombre
            <input value={draft.name} onChange={(e) => set("name", e.target.value)} />
          </label>
          <label>
            Rol
            <input value={draft.role} onChange={(e) => set("role", e.target.value)} />
          </label>
        </div>
        <label>
          Prompt (cómo trabaja, qué sabe, cómo habla)
          <textarea rows={4} value={draft.prompt} onChange={(e) => set("prompt", e.target.value)} />
        </label>
        <div className="row3">
          <label>
            Proveedor
            <select value={draft.providerId} onChange={(e) => set("providerId", e.target.value)}>
              {office.providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.kind !== "demo" && p.kind !== "claude-code" && !p.hasKey && !p.baseUrl ? " (sin key)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Modelo
            <input value={draft.model} placeholder={provider?.kind === "anthropic" ? "claude-sonnet-5-5" : provider?.kind === "claude-code" ? "sonnet" : "gpt-4o-mini"} onChange={(e) => set("model", e.target.value)} />
          </label>
          {provider?.kind === "claude-code" && (
            <label>
              Esfuerzo
              <select value={draft.effort ?? ""} onChange={(e) => set("effort", e.target.value)}>
                <option value="">Por defecto</option>
                <option value="low">Bajo</option>
                <option value="medium">Medio</option>
                <option value="high">Alto</option>
                <option value="xhigh">Muy alto</option>
                <option value="max">Máximo</option>
              </select>
            </label>
          )}
          <label>
            Escritorio
            <select value={draft.seat} onChange={(e) => set("seat", Number(e.target.value))}>
              {office.layout.seats.map((_, i) => {
                const who = office.agents.find((a) => a.seat === i && a.id !== agent.id);
                return (
                  <option key={i} value={i}>
                    #{i + 1} {who ? `(${who.name})` : ""}
                  </option>
                );
              })}
            </select>
          </label>
        </div>
        <label className="check pc-toggle">
          <input type="checkbox" checked={!!draft.tools} onChange={(e) => set("tools", e.target.checked)} />
          🖥 Puede usar la PC (leer, escribir y correr comandos; te pide permiso)
        </label>
        {provider?.kind === "claude-code" && (
          <label className="check pc-toggle">
            <input type="checkbox" checked={!!draft.imap} onChange={(e) => set("imap", e.target.checked)} />
            ✉ Correo por IMAP (Zoho u otro; lee y deja borradores; requiere configurarlo en la PC)
          </label>
        )}
        <label className="check pc-toggle">
          <input type="checkbox" checked={!!draft.manager} onChange={(e) => set("manager", e.target.checked)} />
          🛠 Administra la oficina (crea y configura a los demás; lo delicado te lo pregunta)
        </label>
        {provider?.kind === "claude-code" && (
          <label className="check pc-toggle">
            <input type="checkbox" checked={!!draft.mail} onChange={(e) => set("mail", e.target.checked)} />
            ✉ Puede usar el Gmail de su cuenta (lee y deja borradores; no envía ni borra)
          </label>
        )}
        {draft.tools && (
          <label>
            Carpeta de trabajo (opcional)
            <input
              value={draft.workspace ?? ""}
              placeholder="vacía = la carpeta de Modelos → Ajustes · ej. C:\Users\tu-usuario\proyecto"
              onChange={(e) => set("workspace", e.target.value)}
            />
          </label>
        )}
        <MemoryPanel agent={agent} onError={onError} />
        <details open={!!agent.look || progress?.status === "drawing"}>
          <summary>Apariencia {agent.look ? "· dibujada con IA" : "· pixel simple"}</summary>
          <LookPanel agent={agent} office={office} progress={progress} onError={onError} />
          <div className="looks">
            <span>Piel</span>
            <Swatches colors={PALETTES.SKINS} value={draft.appearance.skin} onPick={(c) => look("skin", c)} />
            <span>Pelo</span>
            <Swatches colors={PALETTES.HAIRS} value={draft.appearance.hair} onPick={(c) => look("hair", c)} />
            <span>Camiseta</span>
            <Swatches colors={PALETTES.SHIRTS} value={draft.appearance.shirt} onPick={(c) => look("shirt", c)} />
            <span>Pantalón</span>
            <Swatches colors={PALETTES.PANTS} value={draft.appearance.pants} onPick={(c) => look("pants", c)} />
            <span>Peinado</span>
            <div className="chips">
              {PALETTES.STYLES.map((s) => (
                <button key={s} className={draft.appearance.hairStyle === s ? "on" : ""} onClick={() => look("hairStyle", s)}>
                  {STYLE_LABEL[s]}
                </button>
              ))}
            </div>
            <span>Extra</span>
            <div className="chips">
              {ACCESSORIES.map((s) => (
                <button key={s} className={(draft.appearance.accessory ?? "none") === s ? "on" : ""} onClick={() => look("accessory", s)}>
                  {ACC_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        </details>
        <div className="card-actions">
          <label className="check">
            <input type="checkbox" checked={!!draft.lead} onChange={(e) => set("lead", e.target.checked)} /> ★ Líder (reparte las tareas)
          </label>
          <span className="spacer" />
          <button
            className="ghost danger"
            onClick={async () => {
              try {
                await api.deleteAgent(agent.id);
              } catch (e) {
                onError((e as Error).message);
              }
            }}
          >
            Despedir
          </button>
          <button className="ghost" disabled={!dirty} onClick={() => setDraft(agent)}>
            Deshacer
          </button>
          <button disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </article>
  );
}

export function TeamEditor({ office, looks }: { office: PublicOffice; looks: LookProgress }) {
  const [error, setError] = useState<string | null>(null);
  const free = office.layout.seats.findIndex((_, i) => !office.agents.some((a) => a.seat === i));

  const hire = async () => {
    setError(null);
    const name = `Persona ${office.agents.length + 1}`;
    const lead = office.agents.find((a) => a.lead);
    try {
      await api.createAgent({
        name,
        role: "Nuevo rol",
        prompt: "Describe aquí qué hace esta persona en el equipo, qué sabe y cómo responde.",
        providerId: lead?.providerId ?? office.providers[0]?.id,
        model: lead?.model ?? "",
        appearance: randomAppearance(`${name}-${Date.now()}`),
        seat: free === -1 ? 0 : free,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="editor">
      <div className="editor-head">
        <div>
          <h2>Equipo</h2>
          <p>Cada persona tiene un rol y un prompt. El líder lee tus pedidos y los reparte según el rol.</p>
        </div>
        <button onClick={() => void hire()}>+ Sumar persona</button>
      </div>
      {free === -1 && <div className="warn">No quedan escritorios libres: agrega uno en la oficina con “✥ Escritorios”.</div>}
      {error && <div className="error">{error}</div>}
      <div className="cards">
        {office.agents.map((a) => (
          <AgentCard key={a.id} agent={a} office={office} progress={looks[a.id]} onError={setError} />
        ))}
      </div>
    </div>
  );
}
