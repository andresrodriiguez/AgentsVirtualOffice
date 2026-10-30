import { useEffect, useState } from "react";
import type { PublicOffice } from "../../shared/types.ts";
import { api, type Task } from "../api.ts";

const DAYS = ["D", "L", "M", "X", "J", "V", "S"];

function TaskCard({ task, office, reload }: { task: Task; office: PublicOffice; reload: () => void }) {
  const [draft, setDraft] = useState(task);
  const [msg, setMsg] = useState("");
  useEffect(() => setDraft(task), [task]);
  const dirty = JSON.stringify({ ...draft, lastRun: 0 }) !== JSON.stringify({ ...task, lastRun: 0 });
  const act = async (fn: () => Promise<unknown>, ok = "") => {
    setMsg("");
    try {
      await fn();
      setMsg(ok);
      reload();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <div className={`provider task ${draft.enabled ? "" : "off"}`}>
      <div className="task-head">
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <input type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
        <label className="check">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
          Activa
        </label>
      </div>
      <div className="task-days">
        {DAYS.map((d, i) => (
          <button
            key={i}
            className={!draft.days.length || draft.days.includes(i) ? "on ghost" : "ghost"}
            onClick={() => {
              const all = draft.days.length ? draft.days : [0, 1, 2, 3, 4, 5, 6];
              const next = all.includes(i) ? all.filter((x) => x !== i) : [...all, i].sort();
              setDraft({ ...draft, days: next.length === 7 ? [] : next });
            }}
          >
            {d}
          </button>
        ))}
        <select value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })}>
          <option value="">Equipo (Mate reparte)</option>
          {office.agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <textarea rows={3} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
      <div className="task-actions">
        <small>{task.lastRun ? `Última vez: ${task.lastRun}` : "Aún no se ha ejecutado"}</small>
        <span className="spacer" />
        {msg && <small>{msg}</small>}
        <button className="ghost danger" onClick={() => act(() => api.deleteTask(task.id))}>
          Borrar
        </button>
        <button className="ghost" onClick={() => act(() => api.runTask(task.id), "Lanzada: mira el chat")}>
          Ejecutar ahora
        </button>
        <button disabled={!dirty} onClick={() => act(() => api.updateTask(task.id, draft), "Guardada")}>
          Guardar
        </button>
      </div>
    </div>
  );
}

function Alerts() {
  const [state, setState] = useState<{ enabled: boolean; topic: string } | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => void api.ntfy().then(setState).catch(() => {}), []);
  if (!state) return null;
  return (
    <div className="provider task">
      <div className="task-head">
        <b>📱 Avisos al iPhone (ntfy)</b>
        <span className="spacer" />
        <label className="check">
          <input
            type="checkbox"
            checked={state.enabled}
            onChange={(e) => api.setNtfy(e.target.checked).then(setState).catch((err) => setMsg((err as Error).message))}
          />
          Activados
        </label>
      </div>
      <small>
        1) Instala la app <b>ntfy</b> (App Store, gratis). 2) En la app toca <b>+</b> y suscríbete al tema de abajo. 3) Pulsa "Enviar prueba". Te
        avisa cuando un agente espera tu permiso o cuando terminan con la oficina cerrada. El aviso nunca incluye el contenido de tus correos o archivos.
      </small>
      <code style={{ userSelect: "all" }}>{state.topic}</code>
      <div className="task-actions">
        {msg && <small>{msg}</small>}
        <span className="spacer" />
        <button
          className="ghost"
          onClick={() =>
            api
              .testNtfy()
              .then(() => setMsg("Enviado: mira tu iPhone"))
              .catch((e) => setMsg((e as Error).message))
          }
        >
          Enviar prueba
        </button>
      </div>
    </div>
  );
}

export function TasksEditor({ office }: { office: PublicOffice }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const load = () => api.tasks().then(setTasks).catch(() => {});
  useEffect(() => void load(), []);
  return (
    <div className="editor">
      <div className="editor-head">
        <div>
          <h2>Tareas programadas</h2>
          <p>
            Los agentes trabajan solos a la hora que elijas y el resultado queda esperándote en el chat. Sólo corren mientras la
            oficina esté abierta en tu PC.
          </p>
        </div>
        <button onClick={() => api.createTask({ name: "Nueva tarea", text: "Describe qué debe hacer", time: "09:00", days: [], enabled: false }).then(load)}>
          + Tarea
        </button>
      </div>
      <div className="cards">
        <Alerts />
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} office={office} reload={load} />
        ))}
      </div>
    </div>
  );
}
