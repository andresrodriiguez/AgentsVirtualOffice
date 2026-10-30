import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentMemory, MemoryBlockFilter, memorySection } from "../../server/memory.ts";
import { addressedAgent, compactHistory } from "../../server/orchestrator.ts";
import { defaultOffice, History } from "../../server/store.ts";
import { UsageLog } from "../../server/usage.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "office-test-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function filterAll(chunks: string[]) {
  const f = new MemoryBlockFilter();
  let out = "";
  for (const c of chunks) out += f.push(c);
  out += f.flush();
  return { out, ops: f.ops };
}

describe("MemoryBlockFilter", () => {
  it("strips a memory block and collects its notes", () => {
    const { out, ops } = filterAll(["Listo.\n\n<memoria>- Prefiere asuntos cortos</memoria>"]);
    expect(out.trim()).toBe("Listo.");
    expect(ops).toEqual([{ mode: "append", text: "- Prefiere asuntos cortos" }]);
  });

  it("handles tags split across streamed chunks", () => {
    const text = 'Hola <memoria modo="reemplazar">uno\ndos</memoria> adiós';
    for (let size = 1; size <= 7; size++) {
      const chunks = text.match(new RegExp(`[\\s\\S]{1,${size}}`, "g"))!;
      const { out, ops } = filterAll(chunks);
      expect(out).toBe("Hola  adiós");
      expect(ops).toEqual([{ mode: "replace", text: "uno\ndos" }]);
    }
  });

  it("leaves ordinary angle brackets alone", () => {
    expect(filterAll(["a < b y <memorable> y <div>"]).out).toBe("a < b y <memorable> y <div>");
    expect(filterAll(["termina en <mem"]).out).toBe("termina en <mem");
  });

  it("keeps unfinished append notes but drops an unfinished rewrite", () => {
    expect(filterAll(["<memoria>nota a medias"]).ops).toEqual([{ mode: "append", text: "nota a medias" }]);
    expect(filterAll(['<memoria modo="reemplazar">todo a medias']).ops).toEqual([]);
  });
});

describe("AgentMemory", () => {
  it("appends dated notes and replaces on request", async () => {
    const mem = new AgentMemory(dir);
    expect(await mem.read("bruno")).toBe("");
    const day = new Date("2026-10-30T12:00:00Z");
    await mem.apply("bruno", [{ mode: "append", text: "- usa n8n" }], day);
    await mem.apply("bruno", [{ mode: "append", text: "- tasa 7.32%" }], day);
    expect(await mem.read("bruno")).toBe("[2026-10-30]\n- usa n8n\n\n[2026-10-30]\n- tasa 7.32%\n");
    await mem.apply("bruno", [{ mode: "replace", text: "resumen corto" }], day);
    expect(await readFile(join(dir, "bruno", "memoria.md"), "utf8")).toBe("resumen corto\n");
  });

  it("keeps agents in their own folder even with odd ids", async () => {
    const mem = new AgentMemory(dir);
    await mem.write("../../evil", "x");
    expect(await mem.read("../../evil")).toBe("x\n");
    expect(await mem.read("bruno")).toBe("");
  });

  it("shows the tail of a long memory and asks to condense it", () => {
    const long = "a".repeat(5000);
    const section = memorySection(long, true);
    expect(section).toContain("[…]");
    expect(section).toContain("reescribirla más corta");
    expect(memorySection("", true)).toContain("(vacía)");
    expect(memorySection("algo", false)).not.toContain("<memoria>…</memoria>");
  });
});

describe("History on disk", () => {
  it("survives a restart and resets cleanly", () => {
    const a = new History(dir);
    a.push("mate", { role: "user", content: "hola" }, { role: "assistant", content: "buenas" });
    const b = new History(dir);
    expect(b.get("mate")).toEqual([
      { role: "user", content: "hola" },
      { role: "assistant", content: "buenas" },
    ]);
    b.reset("mate");
    expect(new History(dir).get("mate")).toEqual([]);
    a.push("mate", { role: "user", content: "otra" });
    new History(dir).reset();
    expect(new History(dir).get("mate")).toEqual([]);
  });
});

describe("token savers", () => {
  it("clips old and long history entries", () => {
    const long = "x".repeat(5000);
    const msgs = Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? ("assistant" as const) : ("user" as const), content: long }));
    const out = compactHistory(msgs);
    expect(out[0].content.length).toBeLessThan(700);
    expect(out[7].content.length).toBeLessThan(3100);
    expect(compactHistory([{ role: "user", content: "corto" }])[0].content).toBe("corto");
  });

  it("sends messages that start with a teammate's name straight to them", () => {
    const agents = defaultOffice().agents;
    expect(addressedAgent("Reva, revisa el login", agents)?.id).toBe("reva");
    expect(addressedAgent("@Olivia: un post", agents)?.id).toBe("olivia");
    expect(addressedAgent("Mate, ayúdame", agents)).toBeUndefined();
    expect(addressedAgent("Necesito que Reva revise", agents)).toBeUndefined();
  });

  it("totals usage per provider and reloads it from disk", () => {
    const file = join(dir, "uso.jsonl");
    const log = new UsageLog(file);
    log.record({ agent: "Sofía", provider: "claude-cala", account: "~/.claude-cala", model: "sonnet", kind: "respuesta", input: 100, output: 20, cached: 80, costUsd: 0.01 });
    log.record({ agent: "Sofía", provider: "claude-cala", account: "~/.claude-cala", model: "sonnet", kind: "respuesta", input: 50, output: 10 });
    expect(new UsageLog(file).summary()["claude-cala"]).toEqual({ calls: 2, input: 150, output: 30, cached: 80, costUsd: 0.01 });
  });
});
