import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";

export interface NotifyState {
  enabled: boolean;
  /** Tema de ntfy: es el "secreto" que identifica tu teléfono, por eso es largo y aleatorio. */
  topic: string;
}

/** Avisos al celular con ntfy (https://ntfy.sh). Sólo se mandan avisos genéricos, sin el contenido de tus correos ni archivos. */
export class Notifier {
  private state: NotifyState;

  constructor(
    private readonly file: string,
    private readonly server = process.env.NTFY_SERVER ?? "https://ntfy.sh",
  ) {
    try {
      const raw = JSON.parse(readFileSync(file, "utf8"));
      this.state = { enabled: raw.enabled === true, topic: typeof raw.topic === "string" && raw.topic ? raw.topic : newTopic() };
    } catch {
      this.state = { enabled: false, topic: newTopic() };
    }
    this.save();
  }

  get(): NotifyState {
    return { ...this.state };
  }

  setEnabled(enabled: boolean): NotifyState {
    this.state.enabled = enabled;
    this.save();
    return this.get();
  }

  async send(title: string, message: string, force = false): Promise<void> {
    if (!this.state.enabled && !force) return;
    const res = await fetch(this.server, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic: this.state.topic, title, message, tags: ["office"], priority: 4 }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`ntfy respondió ${res.status}`);
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.state, null, 2));
  }
}

function newTopic(): string {
  return `oficina-${randomBytes(12).toString("hex")}`;
}
