import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Tamaño máximo de memoria que se le muestra al agente en cada conversación (se conserva el final). */
export const MEMORY_PROMPT_LIMIT = 4000;
/** A partir de aquí se le pide al agente que condense su memoria. */
export const MEMORY_CONDENSE_AT = 3000;
export const MEMORY_FILE_LIMIT = 60000;

export interface MemoryOp {
  mode: "append" | "replace";
  text: string;
}

export function agentFolder(root: string, agentId: string): string {
  return join(root, agentId.replace(/[^a-zA-Z0-9_-]/g, "_") || "_");
}

export class AgentMemory {
  constructor(readonly root: string) {}

  private file(agentId: string): string {
    return join(agentFolder(this.root, agentId), "memoria.md");
  }

  async read(agentId: string): Promise<string> {
    try {
      return await readFile(this.file(agentId), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
      throw err;
    }
  }

  async write(agentId: string, text: string): Promise<void> {
    await mkdir(agentFolder(this.root, agentId), { recursive: true });
    await writeFile(this.file(agentId), text.trim() ? `${text.trim()}\n` : "", "utf8");
  }

  async apply(agentId: string, ops: MemoryOp[], now = new Date()): Promise<void> {
    if (ops.length === 0) return;
    let current = await this.read(agentId);
    const day = now.toISOString().slice(0, 10);
    for (const op of ops) {
      if (!op.text) continue;
      current = op.mode === "replace" ? op.text : `${current.trimEnd()}${current.trim() ? "\n\n" : ""}[${day}]\n${op.text}`;
    }
    await this.write(agentId, current.slice(-MEMORY_FILE_LIMIT));
  }
}

const OPEN = "<memoria";
const CLOSE = "</memoria>";
const OPEN_TAG = /^<memoria(\s+modo="reemplazar")?\s*>$/i;

/**
 * Quita del texto en streaming los bloques <memoria>…</memoria> que escribe el agente y los
 * junta como operaciones. <memoria> añade notas; <memoria modo="reemplazar"> reescribe todo.
 */
export class MemoryBlockFilter {
  readonly ops: MemoryOp[] = [];
  private pending = "";
  private block: { mode: MemoryOp["mode"]; text: string } | null = null;

  push(chunk: string): string {
    let buf = this.pending + chunk;
    this.pending = "";
    let out = "";
    for (;;) {
      if (this.block) {
        const all = this.block.text + buf;
        const end = all.toLowerCase().indexOf(CLOSE);
        if (end === -1) {
          this.block.text = all;
          return out;
        }
        this.ops.push({ mode: this.block.mode, text: all.slice(0, end).trim() });
        this.block = null;
        buf = all.slice(end + CLOSE.length);
        continue;
      }
      const start = buf.toLowerCase().indexOf(OPEN);
      if (start === -1) {
        const keep = partialPrefix(buf);
        this.pending = buf.slice(buf.length - keep);
        return out + buf.slice(0, buf.length - keep);
      }
      const gt = buf.indexOf(">", start);
      if (gt === -1) {
        this.pending = buf.slice(start);
        return out + buf.slice(0, start);
      }
      const tag = buf.slice(start, gt + 1);
      const match = OPEN_TAG.exec(tag);
      if (!match) {
        out += buf.slice(0, gt + 1);
        buf = buf.slice(gt + 1);
        continue;
      }
      out += buf.slice(0, start);
      this.block = { mode: match[1] ? "replace" : "append", text: "" };
      buf = buf.slice(gt + 1);
    }
  }

  /** Al terminar: lo retenido sale como texto; un bloque sin cerrar sólo cuenta si añade notas. */
  flush(): string {
    const rest = this.pending;
    this.pending = "";
    if (this.block) {
      const text = this.block.text.trim();
      if (this.block.mode === "append" && text) this.ops.push({ mode: "append", text });
      this.block = null;
    }
    return rest;
  }
}

function partialPrefix(buf: string): number {
  const lower = buf.toLowerCase();
  for (let n = Math.min(OPEN.length - 1, buf.length); n > 0; n--) {
    if (OPEN.startsWith(lower.slice(lower.length - n))) return n;
  }
  return 0;
}

export function memorySection(memory: string, canWrite: boolean): string {
  const shown = memory.length > MEMORY_PROMPT_LIMIT ? `[…]\n${memory.slice(-MEMORY_PROMPT_LIMIT)}` : memory;
  const current = `Tu memoria actual:\n<memoria_actual>\n${shown.trim() || "(vacía)"}\n</memoria_actual>`;
  if (!canWrite) return `\n\n## Tu memoria\nEstas son tus notas de conversaciones anteriores.\n${current}`;
  const condense =
    memory.length > MEMORY_CONDENSE_AT ? "\nTu memoria ya es larga: aprovecha para reescribirla más corta, sin perder lo importante." : "";
  return `

## Tu memoria
Tienes una carpeta propia donde se guarda tu memoria entre conversaciones; lo que anotes aquí lo verás siempre al empezar.
Para guardar algo, escribe en tu respuesta un bloque <memoria>…</memoria> con notas breves (preferencias del usuario, decisiones, contexto de proyectos, pendientes). Se añade a tu memoria y el usuario no verá el bloque. Anota solo lo que servirá más adelante; nunca contraseñas ni claves.
Para reescribirla completa y más corta, usa <memoria modo="reemplazar">…</memoria>.${condense}
${current}`;
}
