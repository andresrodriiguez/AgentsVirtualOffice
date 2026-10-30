import { useEffect, useRef } from "react";
import type { OfficeEvent, PublicOffice } from "../../shared/types.ts";

export type Activity = Extract<OfficeEvent, { type: "tool_call" }> & { at: number };

const ICON: Record<Activity["name"], string> = {
  list_dir: "📂",
  read_file: "👁",
  search: "🔎",
  write_file: "✍",
  edit_file: "✎",
  run_command: "⌨",
  gestionar_oficina: "🛠",
};

function lines(text: unknown, max: number): string[] {
  return String(text ?? "")
    .split("\n")
    .slice(0, max);
}

function Body({ a }: { a: Activity }) {
  if (a.name === "edit_file") {
    return (
      <pre className="act-code">
        {lines(a.args.old_string, 6).map((l, i) => (
          <span key={`o${i}`} className="del">
            - {l}
          </span>
        ))}
        {lines(a.args.new_string, 8).map((l, i) => (
          <span key={`n${i}`} className="add">
            + {l}
          </span>
        ))}
      </pre>
    );
  }
  if (a.name === "write_file") {
    return (
      <pre className="act-code">
        {lines(a.args.content, 8).map((l, i) => (
          <span key={i} className="add">
            + {l}
          </span>
        ))}
      </pre>
    );
  }
  return null;
}

/** Lo que están haciendo los agentes con archivos y comandos, en vivo: qué abren y qué cambian. */
export function ActivityPanel({ office, items }: { office: PublicOffice; items: Activity[] }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items]);
  const byId = new Map(office.agents.map((a) => [a.id, a]));
  return (
    <div className="activity">
      <div className="activity-head">⌥ Actividad en vivo</div>
      <div className="activity-log" ref={box}>
        {!items.length && <div className="act-empty">Aquí aparece el código y los archivos que los agentes leen o modifican.</div>}
        {items.map((a) => {
          const who = byId.get(a.agentId);
          return (
            <div key={a.callId} className="act" style={{ ["--c" as string]: who?.appearance.shirt ?? "#999" }}>
              <div className="act-line">
                <b>{who?.name ?? "?"}</b>
                <span>
                  {ICON[a.name]} {a.summary}
                </span>
              </div>
              <Body a={a} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
