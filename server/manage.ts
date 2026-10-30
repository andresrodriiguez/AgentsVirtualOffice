import type { Agent } from "../shared/types.ts";

export interface ManageAction {
  accion: "crear" | "editar" | "borrar";
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
  return SENSITIVE.some((k) => a[k] !== undefined);
}

export function describeAction(a: ManageAction, agents: Agent[]): string {
  const who = a.accion === "crear" ? String(a.name ?? "persona nueva") : (findAgent(agents, a.quien)?.name ?? String(a.quien ?? "?"));
  const fields = EDITABLE.filter((k) => a[k] !== undefined).map((k) => k);
  if (a.accion === "borrar") return `Borrar a ${who}`;
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
      if (v && typeof v === "object" && ["crear", "editar", "borrar"].includes(v.accion)) this.actions.push(v as ManageAction);
      else this.invalid.push("acción desconocida");
    } catch {
      this.invalid.push("JSON inválido");
    }
  }
}

export function manageSection(agents: Agent[]): string {
  const roster = agents.map((a) => `- ${a.name} (id: ${a.id}) · ${a.role} · ${a.providerId} · ${a.model || "?"}`).join("\n");
  return `

## Administrar la oficina
Eres el administrador de la oficina: Andrés te da la autoridad para crear y configurar a las demás personas del equipo. Para hacerlo escribe en tu respuesta un bloque <oficina>{json}</oficina> (el usuario no lo ve; se ejecuta y te aviso el resultado). Puedes poner varios bloques.
- Crear: <oficina>{"accion":"crear","name":"Nombre","role":"Rol corto","prompt":"Instrucciones completas…","model":"claude-sonnet-5-5","effort":"medium"}</oficina>
- Editar: <oficina>{"accion":"editar","quien":"id o nombre","role":"…","prompt":"…","model":"…","effort":"low|medium|high"}</oficina>
- Borrar: <oficina>{"accion":"borrar","quien":"id o nombre"}</oficina>
Cambiar de cuenta/proveedor (providerId), dar acceso a la PC (tools), al correo (mail), carpeta de trabajo (workspace), liderazgo o administración, y borrar a alguien: Andrés lo confirma en pantalla antes; pídelo igual sin dudar. Enviar correos o tocar archivos no es parte de esto y sigue sujeto a los permisos de cada herramienta.
Proveedores disponibles: claude-code (cuenta por defecto), claude-misterloans, claude-cala. Al crear una persona sin proveedor usa el tuyo. Explica en una línea qué vas a cambiar y por qué.
Equipo actual:
${roster}`;
}
