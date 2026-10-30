import type { Agent } from "../shared/types.ts";

export interface ManageAction {
  accion: "crear" | "editar" | "borrar" | "nuevo_hilo" | "comando";
  /** Id o nombre de la persona (editar y borrar). */
  quien?: string;
  [campo: string]: unknown;
}

const OPEN = "<oficina>";
const CLOSE = "</oficina>";

// Campos que cambian lo que una persona puede hacer o con qué cuenta trabaja: siempre los confirma Andrés.
const SENSITIVE = ["providerId", "tools", "mail", "workspace", "lead", "manager"];
const EDITABLE = ["name", "role", "prompt", "model", "effort", ...SENSITIVE];

export function needsApproval(a: ManageAction): boolean {
  if (a.accion === "borrar") return true;
  // "comando" no pasa por aquí: cada comando lo confirma Andrés con el permiso de ejecutar comandos.
  if (a.accion === "nuevo_hilo" || a.accion === "comando") return false;
  return SENSITIVE.some((k) => a[k] !== undefined);
}

export function describeAction(a: ManageAction, agents: Agent[]): string {
  const who = a.accion === "crear" ? String(a.name ?? "persona nueva") : (findAgent(agents, a.quien)?.name ?? String(a.quien ?? "?"));
  const fields = EDITABLE.filter((k) => a[k] !== undefined).map((k) => k);
  if (a.accion === "borrar") return `Borrar a ${who}`;
  if (a.accion === "nuevo_hilo") return `Abrir hilo nuevo con ${who}`;
  if (a.accion === "comando") return `Ejecutar: ${String(a.comando ?? "").slice(0, 120)}`;
  if (a.accion === "crear") return `Crear a ${who}`;
  return `Editar a ${who}${fields.length ? ` (${fields.join(", ")})` : ""}`;
}

export function findAgent(agents: Agent[], ref: unknown): Agent | undefined {
  if (typeof ref !== "string") return undefined;
  const r = ref.trim().toLowerCase();
  return agents.find((a) => a.id === ref || a.name.toLowerCase() === r);
}

/** Cuerpo para la API de agentes: sólo los campos que Mate puede tocar. */
export function actionBody(a: ManageAction): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const k of EDITABLE) if (a[k] !== undefined) body[k] = a[k];
  if (a.appearance && typeof a.appearance === "object") body.appearance = a.appearance;
  return body;
}

/** Saca de la respuesta los bloques <oficina>{json}</oficina>: el usuario no los ve, se ejecutan aparte. */
export class ManageBlockFilter {
  readonly actions: ManageAction[] = [];
  readonly invalid: string[] = [];
  private pending = "";
  private block: string | null = null;

  push(chunk: string): string {
    let buf = this.pending + chunk;
    this.pending = "";
    let out = "";
    for (;;) {
      if (this.block !== null) {
        const all = this.block + buf;
        const end = all.indexOf(CLOSE);
        if (end === -1) {
          this.block = all;
          return out;
        }
        this.take(all.slice(0, end));
        this.block = null;
        buf = all.slice(end + CLOSE.length);
        continue;
      }
      const start = buf.indexOf(OPEN);
      if (start === -1) {
        let keep = 0;
        for (let n = Math.min(OPEN.length - 1, buf.length); n > 0; n--) {
          if (OPEN.startsWith(buf.slice(buf.length - n))) {
            keep = n;
            break;
          }
        }
        this.pending = buf.slice(buf.length - keep);
        return out + buf.slice(0, buf.length - keep);
      }
      out += buf.slice(0, start);
      this.block = "";
      buf = buf.slice(start + OPEN.length);
    }
  }

  flush(): string {
    const rest = this.pending;
    this.pending = "";
    if (this.block !== null) this.invalid.push("bloque <oficina> sin cerrar");
    this.block = null;
    return rest;
  }

  private take(raw: string): void {
    try {
      const v = JSON.parse(raw.trim());
      if (v && typeof v === "object" && ["crear", "editar", "borrar", "nuevo_hilo", "comando"].includes(v.accion)) this.actions.push(v as ManageAction);
      else this.invalid.push("acción desconocida");
    } catch {
      this.invalid.push("JSON inválido");
    }
  }
}

/** <nuevo_hilo>resumen</nuevo_hilo>: la persona cierra su conversación larga; el resumen pasa a su memoria. */
export class ThreadBlockFilter {
  readonly summaries: string[] = [];
  private pending = "";
  private block: string | null = null;
  private readonly OPEN: string;
  private readonly CLOSE: string;

  constructor(tag = "nuevo_hilo") {
    this.OPEN = `<${tag}>`;
    this.CLOSE = `</${tag}>`;
  }

  push(chunk: string): string {
    const { OPEN, CLOSE } = this;
    let buf = this.pending + chunk;
    this.pending = "";
    let out = "";
    for (;;) {
      if (this.block !== null) {
        const all = this.block + buf;
        const end = all.indexOf(CLOSE);
        if (end === -1) {
          this.block = all;
          return out;
        }
        this.summaries.push(all.slice(0, end).trim());
        this.block = null;
        buf = all.slice(end + CLOSE.length);
        continue;
      }
      const start = buf.indexOf(OPEN);
      if (start === -1) {
        let keep = 0;
        for (let n = Math.min(OPEN.length - 1, buf.length); n > 0; n--) {
          if (OPEN.startsWith(buf.slice(buf.length - n))) {
            keep = n;
            break;
          }
        }
        this.pending = buf.slice(buf.length - keep);
        return out + buf.slice(0, buf.length - keep);
      }
      out += buf.slice(0, start);
      this.block = "";
      buf = buf.slice(start + OPEN.length);
    }
  }

  flush(): string {
    const rest = this.pending;
    this.pending = "";
    // Un bloque sin cerrar (respuesta cortada) igual guarda lo que alcanzó a resumir.
    if (this.block?.trim()) this.summaries.push(this.block.trim());
    this.block = null;
    return rest;
  }
}

export function requestSection(): string {
  return `

Si necesitas un acceso o permiso que no tienes, no lo intentes: escribe al final <solicitud>qué y para qué</solicitud> y Mate se lo plantea a Andrés.`;
}

export const TEAM_MEMORY_ID = "equipo";
const TEAM_MEMORY_LIMIT = 3000;

export function teamSection(memory: string, canDelegate: boolean, peers: string): string {
  const shown = memory.length > TEAM_MEMORY_LIMIT ? `[…]\n${memory.slice(-TEAM_MEMORY_LIMIT)}` : memory;
  const notes = shown.trim() ? `\nNotas del equipo:\n${shown.trim()}` : "";
  const hand = canDelegate ? ` Para pasarle una tarea a un compañero: <para>nombre: tarea</para> (${peers}); sin encadenar.` : "";
  return `\n\nLibreta común: para algo útil a todos escribe <memoria_equipo>nota breve</memoria_equipo>, nunca claves.${hand}${notes}`;
}

export const THREAD_AFTER_CHARS = 12000;

export function threadSection(historyChars: number): string {
  // Sólo cuando la conversación ya es larga; antes no hace falta ni mencionarlo.
  if (historyChars <= THREAD_AFTER_CHARS) return "";
  return `\n\nEsta conversación ya es larga y reenviarla cuesta tokens: al terminar tu respuesta ciérrala con <nuevo_hilo>resumen breve: decisiones, pendientes y datos de Andrés</nuevo_hilo> (pasa a tu memoria y el historial se vacía). No lo expliques ni lo menciones, y no lo hagas a mitad de una tarea.`;
}

export function manageSection(agents: Agent[]): string {
  const roster = agents.map((a) => `${a.name} (${a.id}, ${a.providerId}, ${a.model || "?"})`).join("; ");
  return `

Administras la oficina. Acciones como bloque <oficina>{json}</oficina> (invisible para Andrés; puedes poner varios):
crear {"accion":"crear","name","role","prompt","model","effort"} · editar {"accion":"editar","quien","role|prompt|model|effort|providerId|tools|mail|imap|calendar|workspace"} · borrar {"accion":"borrar","quien"} · hilo nuevo {"accion":"nuevo_hilo","quien","resumen"}.
Borrar y cambiar cuentas/accesos/PC/correo los confirma Andrés en pantalla: pídelos sin dudar. Si un compañero te manda una solicitud de acceso, dile a Andrés en pocas líneas quién, qué y el riesgo, y concédela con "editar" si acepta.
PC de Andrés (Windows, cmd.exe): {"accion":"comando","comando":"…"}, uno por acción; Andrés aprueba cada uno, sin entrada interactiva, 120 s. Ejemplos: start "" spotify:, tasklist, taskkill /im x.exe, del /q /f /s "%TEMP%\\*". Antes de borrar, muestra qué (dir). Nunca formatees, toques el registro ni borres fuera de temporales sin que Andrés lo pida así. No pegues salidas ni código en el chat: se ven en el panel; resume.
Proveedores: claude-code, claude-misterloans, claude-cala. Equipo: ${roster}`;
}
