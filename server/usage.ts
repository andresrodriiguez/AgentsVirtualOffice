import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

export interface UsageEntry {
  t: string;
  agent: string;
  provider: string;
  /** Carpeta de configuración (cuenta) de Claude Code usada, o "por defecto". */
  account: string;
  model: string;
  /** "respuesta" o "ruteo" (la llamada con la que el líder reparte el pedido). */
  kind: "respuesta" | "ruteo";
  input: number;
  output: number;
  cached?: number;
  costUsd?: number;
}

export interface UsageTotal {
  calls: number;
  input: number;
  output: number;
  cached: number;
  costUsd: number;
}

/** Registro de uso en <data>/uso.jsonl: qué cuenta gastó cuánto en cada llamada. */
export class UsageLog {
  private totals = new Map<string, UsageTotal>();

  constructor(private readonly file?: string) {
    if (!file) return;
    try {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!line.trim()) continue;
        try {
          this.add(JSON.parse(line) as UsageEntry);
        } catch {
          // línea dañada: se ignora
        }
      }
    } catch {
      // todavía no hay registro
    }
  }

  private add(e: UsageEntry): void {
    const t = this.totals.get(e.provider) ?? { calls: 0, input: 0, output: 0, cached: 0, costUsd: 0 };
    t.calls += 1;
    t.input += e.input || 0;
    t.output += e.output || 0;
    t.cached += e.cached || 0;
    t.costUsd += e.costUsd || 0;
    this.totals.set(e.provider, t);
  }

  record(entry: Omit<UsageEntry, "t">): void {
    const full: UsageEntry = { t: new Date().toISOString(), ...entry };
    this.add(full);
    if (!this.file) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      appendFileSync(this.file, JSON.stringify(full) + "\n", "utf8");
    } catch (err) {
      console.error("[uso] no se pudo guardar:", (err as Error).message);
    }
  }

  summary(): Record<string, UsageTotal> {
    return Object.fromEntries(this.totals);
  }
}
