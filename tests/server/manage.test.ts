import { describe, expect, it } from "vitest";
import { ManageBlockFilter, needsApproval } from "../../server/manage.ts";

describe("administración de la oficina", () => {
  it("saca los bloques <oficina> aunque lleguen partidos", () => {
    const f = new ManageBlockFilter();
    const text = 'Listo. <ofi' + 'cina>{"accion":"crear","name":"Zoe"}</ofi' + 'cina> Eso es todo.';
    let out = "";
    for (let i = 0; i < text.length; i += 5) out += f.push(text.slice(i, i + 5));
    out += f.flush();
    expect(out).toBe("Listo.  Eso es todo.");
    expect(f.actions).toEqual([{ accion: "crear", name: "Zoe" }]);
  });

  it("marca como delicado lo que da permisos o borra", () => {
    expect(needsApproval({ accion: "crear", name: "Zoe", role: "x" })).toBe(false);
    expect(needsApproval({ accion: "editar", quien: "bruno", prompt: "x" })).toBe(false);
    expect(needsApproval({ accion: "editar", quien: "bruno", mail: true })).toBe(true);
    expect(needsApproval({ accion: "crear", name: "Zoe", tools: true })).toBe(true);
    expect(needsApproval({ accion: "borrar", quien: "bruno" })).toBe(true);
  });

  it("descarta JSON inválido sin romper", () => {
    const f = new ManageBlockFilter();
    f.push("<oficina>no es json</oficina>");
    expect(f.actions).toEqual([]);
    expect(f.invalid).toHaveLength(1);
  });
});

describe("hilos nuevos", () => {
  it("saca el resumen de <nuevo_hilo> aunque llegue partido", async () => {
    const { ThreadBlockFilter } = await import("../../server/manage.ts");
    const f = new ThreadBlockFilter();
    const text = "Listo. <nuevo_" + "hilo>Se decidió X; falta Y.</nuevo_" + "hilo>";
    let out = "";
    for (let i = 0; i < text.length; i += 4) out += f.push(text.slice(i, i + 4));
    out += f.flush();
    expect(out).toBe("Listo. ");
    expect(f.summaries).toEqual(["Se decidió X; falta Y."]);
  });
});
