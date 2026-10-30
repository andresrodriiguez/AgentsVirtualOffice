import { useEffect, useRef, useState } from "react";
import type { PublicOffice } from "../../shared/types.ts";
import type { Upload } from "../api.ts";
import { type Run, type Step, entryText } from "../runs.ts";
import { Markdown } from "./Markdown.tsx";

interface Props {
  office: PublicOffice;
  runs: Run[];
  target: string | null;
  setTarget: (id: string | null) => void;
  onSend: (text: string, files: Upload[]) => Promise<void>;
  busy: boolean;
}

interface Pending extends Upload {
  id: number;
  size: number;
  preview?: string;
}

// Un texto pegado así de largo va como adjunto: el cuadro de texto queda limpio y el agente lo recibe entero.
const PASTE_AS_FILE = 1500;
const KIND_ICON = { image: "🖼", pdf: "📕", text: "📄" };
const ACCEPT = "image/*,.pdf,.docx,.txt,.md,.csv,.json,.html,.xml,.yml,.yaml,.js,.ts,.tsx,.py,.sql,.log";

let nextId = 1;

type Recognizer = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

const SpeechCtor = (): (new () => Recognizer) | undefined => {
  const w = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

function readUpload(file: File, name: string): Promise<Pending> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error(`No pude leer "${name}"`));
    r.onload = () => {
      const url = String(r.result);
      const mime = file.type || "application/octet-stream";
      resolve({
        id: nextId++,
        name,
        mime,
        size: file.size,
        data: url.slice(url.indexOf(",") + 1),
        preview: mime.startsWith("image/") ? url : undefined,
      });
    };
    r.readAsDataURL(file);
  });
}

function kb(n: number): string {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function ChatPanel({ office, runs, target, setTarget, onSend, busy }: Props) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Pending[]>([]);
  const [drag, setDrag] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(() => localStorage.getItem("oficina-voz") === "1");
  const rec = useRef<Recognizer | null>(null);
  const spoken = useRef(new Set<string>());
  const log = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const byId = new Map(office.agents.map((a) => [a.id, a]));
  const lead = office.agents.find((a) => a.lead);
  const focus = target ? byId.get(target) : undefined;
  const shown = focus ? runs.filter((r) => r.target === focus.id || r.entries.some((e) => e.agentId === focus.id)) : runs;

  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [runs, target]);

  useEffect(() => {
    if (target) input.current?.focus();
  }, [target]);

  const toggleMic = () => {
    if (rec.current) {
      rec.current.stop();
      return;
    }
    const Ctor = SpeechCtor();
    if (!Ctor) {
      setError("Tu navegador no tiene dictado por voz (usa Chrome o Edge).");
      return;
    }
    const r = new Ctor();
    r.lang = "es-419";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      let said = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) said += e.results[i][0].transcript;
      if (said) setText((t) => `${t}${t && !/\s$/.test(t) ? " " : ""}${said.trim()}`);
    };
    r.onend = () => {
      rec.current = null;
      setListening(false);
    };
    r.onerror = () => {
      rec.current = null;
      setListening(false);
      setError("No pude usar el micrófono: revisa el permiso del navegador.");
    };
    rec.current = r;
    setListening(true);
    setError(null);
    r.start();
  };

  // Con la voz activada, cada respuesta terminada se lee en voz alta (una vez).
  useEffect(() => {
    if (!speak || !("speechSynthesis" in window)) return;
    for (const r of runs)
      for (const e of r.entries) {
        const key = `${r.id}:${e.agentId}`;
        if (e.status !== "done" || spoken.current.has(key)) continue;
        spoken.current.add(key);
        const plain = entryText(e).replace(/[`*_#>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 700);
        if (!plain) continue;
        const u = new SpeechSynthesisUtterance(plain);
        u.lang = "es-419";
        window.speechSynthesis.speak(u);
      }
  }, [runs, speak]);

  const add = async (list: File[], screenshots = false) => {
    if (!list.length) return;
    setError(null);
    try {
      // Las capturas pegadas llegan todas como "image.png": se numeran para distinguirlas.
      const shots = files.filter((f) => f.name.startsWith("captura")).length;
      const read = await Promise.all(list.map((f, i) => readUpload(f, screenshots ? `captura ${shots + i + 1}.png` : f.name)));
      setFiles((cur) => [...cur, ...read]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const submit = async () => {
    const t = text.trim();
    if ((!t && !files.length) || sending) return;
    setError(null);
    setSending(true);
    try {
      await onSend(
        t,
        files.map(({ name, mime, data }) => ({ name, mime, data })),
      );
      setText("");
      setFiles([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      className={`panel chat ${focus ? "focused" : ""} ${drag ? "dropping" : ""}`}
      style={focus ? { ["--c" as string]: focus.appearance.shirt } : undefined}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void add([...e.dataTransfer.files]);
      }}
    >
      {focus ? (
        <header className="panel-head focus-head">
          <span className="focus-who">
            <i className="avatar">{focus.name.slice(0, 1)}</i>
            <span>
              <b>
                {focus.lead && "★ "}
                {focus.name}
              </b>
              <small>{focus.role}</small>
            </span>
          </span>
          <button className="ghost" onClick={() => setTarget(null)} title="Volver a la oficina (Esc)">
            ✕ Volver a la oficina
          </button>
        </header>
      ) : (
        <header className="panel-head">
          <span>💬 Conversación</span>
          <small>{runs.length} pedidos</small>
        </header>
      )}
      <div className="log" ref={log}>
        {!shown.length && (
          <div className="empty">
            {focus
              ? `Todavía no hablaste con ${focus.name}. Escríbele abajo; puedes pegar capturas con Ctrl+V o arrastrar documentos aquí.`
              : `Escríbele al equipo abajo. ${lead ? `${lead.name} lee el pedido` : "El líder lee el pedido"} y se lo pasa a quien corresponda. Haz clic en alguien de la oficina para hablarle directo.`}
          </div>
        )}
        {shown.map((r) => (
          <div key={r.id} className="run">
            <div className="msg user">
              <span className="who">Tú {r.target ? `→ ${byId.get(r.target)?.name ?? "?"}` : "→ equipo"}</span>
              <p>{r.text}</p>
              {r.attachments.length > 0 && (
                <div className="sent-files">
                  {r.attachments.map((a, i) => (
                    <span key={i} className="file-chip">
                      {KIND_ICON[a.kind]} {a.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {r.routing && !r.note && lead && (
              <div className="route">
                <span style={{ color: lead.appearance.shirt }}>{lead.name}</span> está viendo a quién le toca…
              </div>
            )}
            {r.note && (
              <div className="route">
                <span style={{ color: lead?.appearance.shirt }}>{lead?.name}</span>: {r.note}
              </div>
            )}
            {r.entries.map((e) => {
              const a = byId.get(e.agentId);
              return (
                <div key={e.agentId} className={`msg agent ${e.status}`} style={{ ["--c" as string]: a?.appearance.shirt ?? "#999" }}>
                  <span className="who">
                    {a?.name ?? "?"} <em>{a?.role}</em>
                    {e.status === "working" && <i className="pulse" />}
                    {e.status === "done" && <small>{e.tokens} tok</small>}
                  </span>
                  {e.from && <div className="task">📄 {e.task}</div>}
                  {e.steps.map((st, i) => (
                    <StepView key={i} step={st} />
                  ))}
                  {!entryText(e) && !e.steps.length && <p>{e.status === "working" ? "…" : ""}</p>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="composer">
        {drag && <div className="drop-hint">Suelta aquí para adjuntar</div>}
        {!focus && (
          <div className="targets">
            <button className={!target ? "on" : ""} onClick={() => setTarget(null)}>
              👥 Equipo
            </button>
            {office.agents.map((a) => (
              <button
                key={a.id}
                className={target === a.id ? "on" : ""}
                style={{ ["--c" as string]: a.appearance.shirt }}
                onClick={() => setTarget(a.id)}
              >
                {a.name}
              </button>
            ))}
          </div>
        )}
        {files.length > 0 && (
          <div className="attach-list">
            {files.map((f) => (
              <span key={f.id} className="attach" title={`${f.name} · ${kb(f.size)}`}>
                {f.preview ? <img src={f.preview} alt="" /> : <i>{/pdf/.test(f.mime) ? "📕" : "📄"}</i>}
                <span className="attach-name">{f.name}</span>
                <small>{kb(f.size)}</small>
                <button aria-label={`Quitar ${f.name}`} onClick={() => setFiles((cur) => cur.filter((x) => x.id !== f.id))}>
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="input-row">
          <button className="clip" title="Adjuntar imágenes o documentos" onClick={() => picker.current?.click()}>
            📎
          </button>
          <button className={`clip ${listening ? "rec" : ""}`} title={listening ? "Detener dictado" : "Dictar con la voz"} onClick={toggleMic}>
            🎤
          </button>
          <button
            className={`clip ${speak ? "rec" : ""}`}
            title={speak ? "Dejar de leer las respuestas en voz alta" : "Leer las respuestas en voz alta"}
            onClick={() => {
              const next = !speak;
              setSpeak(next);
              localStorage.setItem("oficina-voz", next ? "1" : "0");
              if (!next) window.speechSynthesis?.cancel();
              else spoken.current = new Set(runs.flatMap((r) => r.entries.map((e) => `${r.id}:${e.agentId}`)));
            }}
          >
            🔊
          </button>
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            accept={ACCEPT}
            onChange={(e) => {
              void add([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
          <textarea
            ref={input}
            value={text}
            placeholder={
              focus
                ? `Escríbele a ${focus.name}… (pega capturas con Ctrl+V o arrastra archivos)`
                : "¿Qué necesitas? El líder lo reparte… (puedes pegar o arrastrar archivos)"
            }
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              const pastedFiles = [...e.clipboardData.files];
              if (pastedFiles.length) {
                e.preventDefault();
                void add(pastedFiles, pastedFiles.every((f) => !f.name || f.name === "image.png"));
                return;
              }
              const pasted = e.clipboardData.getData("text");
              if (pasted.length > PASTE_AS_FILE) {
                e.preventDefault();
                const n = files.filter((f) => f.name.startsWith("texto pegado")).length + 1;
                void add([new File([pasted], `texto pegado ${n}.txt`, { type: "text/plain" })]);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={focus ? 3 : 2}
          />
          <button className="send" disabled={(!text.trim() && !files.length) || sending} onClick={() => void submit()}>
            {sending ? "Subiendo…" : busy ? "…" : "Enviar"}
          </button>
        </div>
        {error && <div className="error">{error}</div>}
      </div>
    </section>
  );
}

const STATE_ICON = { running: "⏳", asking: "🔐", ok: "✓", error: "✕", denied: "⛔" };

function StepView({ step }: { step: Step }) {
  if (step.kind === "text") return step.text.trim() ? <Markdown text={step.text} /> : null;
  // El código, los comandos y sus resultados viven en el panel "Actividad en vivo"; aquí sólo lo que necesita tu atención.
  if (step.state === "ok" || step.state === "running") return null;
  return (
    <details className={`tool ${step.state}`}>
      <summary>
        <span className="tool-icon">{STATE_ICON[step.state]}</span>
        <code>{step.name}</code> <span className="tool-sum">{step.summary}</span>
        {step.state === "asking" && <em> esperando tu permiso</em>}
        {step.state === "denied" && <em> denegado</em>}
      </summary>
      {step.output && <pre>{step.output}</pre>}
    </details>
  );
}
