// Guarda la cuenta de correo IMAP de un agente. Pide la contraseña de aplicación aquí, en tu terminal
// (no se ve al escribir) y la deja sólo en data/correo/<cuenta>.json, que git ignora.
// Uso: node scripts/correo-config.mjs <agente> <correo> [servidor-imap]
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [agente, user, host = "imap.zoho.com"] = process.argv.slice(2);
if (!agente || !user) {
  console.error("Uso: node scripts/correo-config.mjs <agente> <correo> [servidor-imap]");
  process.exit(1);
}
process.stdout.write(`Contraseña de aplicación de ${user} (no se muestra): `);
const stdin = process.stdin;
stdin.setRawMode?.(true);
stdin.resume();
stdin.setEncoding("utf8");
let password = "";
await new Promise((done) => {
  stdin.on("data", (ch) => {
    for (const c of ch) {
      if (c === "\r" || c === "\n") {
        stdin.setRawMode?.(false);
        stdin.pause();
        process.stdout.write("\n");
        return done();
      }
      if (c === "\u0003") process.exit(1);
      if (c === "\u007f" || c === "\b") password = password.slice(0, -1);
      else password += c;
    }
  });
});
password = password.replace(/\s+/g, "");
const dir = resolve(fileURLToPath(new URL("../data/correo", import.meta.url)));
await mkdir(dir, { recursive: true });
const secret = resolve(dir, `${agente}.json`);
await writeFile(secret, JSON.stringify({ host, port: 993, user, password }, null, 2), { mode: 0o600 });
const script = fileURLToPath(new URL("./correo-mcp.mjs", import.meta.url));
await writeFile(
  resolve(dir, `${agente}.mcp.json`),
  JSON.stringify({ mcpServers: { correo: { command: process.execPath, args: [script, secret] } } }, null, 2),
);
console.log(`Listo: ${user} guardado para ${agente} en ${secret}`);
