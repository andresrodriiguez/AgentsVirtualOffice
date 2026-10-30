#!/usr/bin/env node
// Simula `claude -p --output-format stream-json`: devuelve lo que llega por stdin.
let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
  out({ type: "system", subtype: "init", args: process.argv.slice(2) });
  for (const text of ["eco: ", input]) {
    out({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }, parent_tool_use_id: null });
  }
  out({ type: "assistant", message: { content: [{ type: "text", text: "eco: " + input }] } });
  out({ type: "result", is_error: false, usage: { input_tokens: 7, output_tokens: 3 } });
});
