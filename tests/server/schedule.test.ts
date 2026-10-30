import { describe, expect, it } from "vitest";
import { cleanTask, isDue, type Task } from "../../server/schedule.ts";

const base: Task = { id: "t", name: "x", target: "", text: "hola", time: "08:00", days: [1, 2, 3, 4, 5], enabled: true };
const at = (iso: string) => new Date(iso);

describe("tareas programadas", () => {
  it("toca sólo en su día, pasada su hora y una vez al día", () => {
    expect(isDue(base, at("2026-11-02T07:59:00"))).toBe(false); // lunes, antes de hora
    expect(isDue(base, at("2026-11-02T08:01:00"))).toBe(true);
    expect(isDue({ ...base, lastRun: "2026-11-02" }, at("2026-11-02T09:00:00"))).toBe(false);
    expect(isDue(base, at("2026-11-01T09:00:00"))).toBe(false); // domingo
    expect(isDue({ ...base, enabled: false }, at("2026-11-02T09:00:00"))).toBe(false);
  });

  it("valida hora y texto", () => {
    expect(() => cleanTask({ text: "a", time: "25:00" })).toThrow();
    expect(() => cleanTask({ text: "  ", time: "08:00" })).toThrow();
    expect(cleanTask({ text: "a", time: "08:30" }).days).toEqual([]);
  });
});
