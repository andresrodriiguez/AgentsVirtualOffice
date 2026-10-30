import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { claudeCodeArgs, streamChat, toClaudeCodePrompt } from "../../server/providers.ts";
import { CLAUDE_CODE_PROVIDER, defaultOffice, migrateOffice } from "../../server/store.ts";

const FAKE = fileURLToPath(new URL("./fixtures/fake-claude.mjs", import.meta.url));

describe("claude-code provider", () => {
  afterEach(() => {
    delete process.env.CLAUDE_BIN;
  });

  it("streams text and usage from the claude CLI", async () => {
    process.env.CLAUDE_BIN = FAKE;
    let text = "";
    let usage;
    for await (const chunk of streamChat({ provider: CLAUDE_CODE_PROVIDER, model: "sonnet", system: "sos breve", messages: [{ role: "user", content: "hola" }] })) {
      if (chunk.text) text += chunk.text;
      if (chunk.usage) usage = chunk.usage;
    }
    expect(text).toBe("eco: hola");
    expect(usage).toEqual({ input: 7, output: 3 });
  });

  it("fails clearly when the CLI is missing", async () => {
    process.env.CLAUDE_BIN = "/no/existe/claude";
    const run = async () => {
      for await (const _ of streamChat({ provider: CLAUDE_CODE_PROVIDER, model: "", system: "", messages: [{ role: "user", content: "x" }] })) void _;
    };
    await expect(run()).rejects.toThrow(/Claude Code/);
  });

  it("disables tools unless some are given", () => {
    const none = claudeCodeArgs("sonnet", "/tmp/s.md", []);
    expect(none[none.indexOf("--tools") + 1]).toBe("");
    expect(none).not.toContain("--allowedTools");
    expect(none.slice(-2)).toEqual(["--model", "sonnet"]);
    const read = claudeCodeArgs("demo", "/tmp/s.md", ["Read", "Grep"]);
    expect(read[read.indexOf("--allowedTools") + 1]).toBe("Read,Grep");
    expect(read).not.toContain("--model");
  });

  it("folds history into one prompt", () => {
    expect(toClaudeCodePrompt([{ role: "user", content: "a" }])).toBe("a");
    const p = toClaudeCodePrompt([
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
    ]);
    expect(p).toContain("Usuario: a");
    expect(p).toContain("Vos: b");
    expect(p.endsWith("c")).toBe(true);
  });

  it("moves an all-demo office to Claude Code once", () => {
    const office = defaultOffice();
    office.providers = office.providers.filter((p) => p.kind !== "claude-code");
    for (const a of office.agents) {
      a.providerId = "demo";
      a.model = "demo";
    }
    expect(migrateOffice(office)).toBe(true);
    expect(office.agents.every((a) => a.providerId === "claude-code" && a.model === "sonnet")).toBe(true);
    office.agents[0].providerId = "demo";
    migrateOffice(office);
    expect(office.agents[0].providerId).toBe("demo");
  });
});
