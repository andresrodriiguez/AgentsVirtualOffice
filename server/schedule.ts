import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export interface Task {
  id: string;
  name: string;
  /** Quién la recibe; vacío = el equipo (el líder reparte). */
  target: string;
  text: string;
  /** Hora local "HH:MM". */
  time: string;
  /** Días de la semana (0 = domingo … 6 = sábado). Vacío = todos. */
  days: number[];
  enabled: boolean;
  /** Fecha local (AAAA-MM-DD) de la última ejecución, para no repetirla el mismo día. */
  lastRun?: string;
}

export const BRIEFING: Omit<Task, "id"> = {
  name: "Briefing de la mañana",
  target: "",
  text: "Briefing de la mañana. Sofía: resume los correos nuevos e importantes de la bandeja de Cala (qué piden, qué es urgente, qué puedes responder con un borrador). Bruno: lo mismo con el correo de Mister Loans. Sean breves, en viñetas, y dejen borradores de respuesta sólo donde haga falta.",
  time: "08:00",
  days: [1, 2, 3, 4, 5],
  enabled: false,
};

export function localDate(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Una tarea toca si está activa, es su día, ya pasó su hora y hoy no se ha ejecutado. */
export function isDue(task: Task, now: Date): boolean {
  if (!task.enabled || task.lastRun === localDate(now)) return false;
  if (task.days.length && !task.days.includes(now.getDay())) return false;
  const [h, m] = task.time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return false;
  return now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
}

export function cleanTask(raw: Record<string, unknown>, base?: Task): Task {
  const str = (v: unknown, d: string) => (typeof v === "string" ? v.trim() : d);
  const time = str(raw.time, base?.time ?? "08:00");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('"time" tiene que ser HH:MM');
  const days = Array.isArray(raw.days) ? raw.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6) : (base?.days ?? []);
  const text = str(raw.text, base?.text ?? "");
  if (!text) throw new Error('"text" es obligatorio');
  return {
    id: base?.id ?? randomUUID().slice(0, 8),
    name: str(raw.name, base?.name ?? "") || text.slice(0, 40),
    target: str(raw.target, base?.target ?? ""),
    text,
    time,
    days,
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : (base?.enabled ?? true),
    lastRun: base?.lastRun,
  };
}

/** Tareas programadas en <data>/tareas.json. */
export class Tasks {
  private list: Task[] = [];

  constructor(private readonly file: string) {
    try {
      const raw = JSON.parse(readFileSync(file, "utf8"));
      if (Array.isArray(raw)) this.list = raw;
    } catch {
      this.list = [{ id: "briefing", ...BRIEFING }];
      this.save();
    }
  }

  all(): Task[] {
    return this.list.map((t) => ({ ...t }));
  }

  get(id: string): Task | undefined {
    return this.list.find((t) => t.id === id);
  }

  add(raw: Record<string, unknown>): Task {
    const t = cleanTask(raw);
    this.list.push(t);
    this.save();
    return t;
  }

  update(id: string, raw: Record<string, unknown>): Task | undefined {
    const i = this.list.findIndex((t) => t.id === id);
    if (i === -1) return undefined;
    this.list[i] = cleanTask({ ...this.list[i], ...raw }, this.list[i]);
    this.save();
    return this.list[i];
  }

  remove(id: string): boolean {
    const n = this.list.length;
    this.list = this.list.filter((t) => t.id !== id);
    this.save();
    return this.list.length < n;
  }

  markRun(id: string, now: Date): void {
    const t = this.get(id);
    if (t) {
      t.lastRun = localDate(now);
      this.save();
    }
  }

  due(now: Date): Task[] {
    return this.list.filter((t) => isDue(t, now)).map((t) => ({ ...t }));
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.list, null, 2));
  }
}
