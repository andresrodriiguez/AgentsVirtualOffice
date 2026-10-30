import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { AttachmentError, docxText, prepareAttachments } from "../../server/attachments.ts";
import { claudeCodeArgs, claudeCodeInput } from "../../server/providers.ts";

// Zip mínimo con una sola entrada comprimida, como los que arma Word.
function zip(name: string, content: string): Buffer {
  const data = deflateRawSync(Buffer.from(content, "utf8"));
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(0, 42);
  const cdOffset = local.length + nameBuf.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBuf.length, 12);
  end.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, nameBuf, data, central, nameBuf, end]);
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64");

describe("adjuntos", () => {
  it("separa imágenes y PDF de los documentos de texto", () => {
    const p = prepareAttachments([
      { name: "foto.png", mime: "image/png", data: b64("png") },
      { name: "contrato.pdf", mime: "application/pdf", data: b64("pdf") },
      { name: "notas.md", mime: "", data: b64("# Hola") },
    ]);
    expect(p.media.map((m) => m.mime)).toEqual(["image/png", "application/pdf"]);
    expect(p.info.map((i) => i.kind)).toEqual(["image", "pdf", "text"]);
    expect(p.extra).toContain("--- Archivo adjunto: notas.md ---\n# Hola");
  });

  it("extrae el texto de un Word", () => {
    const xml = '<w:document><w:body><w:p><w:r><w:t>Hola &amp; chau</w:t></w:r></w:p><w:p><w:r><w:t>Segunda</w:t></w:r></w:p></w:body></w:document>';
    expect(docxText(zip("word/document.xml", xml)).trim()).toBe("Hola & chau\nSegunda");
  });

  it("rechaza formatos que no puede leer", () => {
    expect(() => prepareAttachments([{ name: "x.exe", mime: "application/x-msdownload", data: b64("MZ") }])).toThrow(AttachmentError);
  });

  it("manda imágenes y PDF a Claude Code como bloques stream-json", () => {
    expect(claudeCodeArgs("haiku", "/s.md", [], false, true)).toContain("stream-json");
    const line = JSON.parse(claudeCodeInput("mira", [{ name: "a.pdf", mime: "application/pdf", data: "UERG" }]));
    expect(line.message.content[0]).toEqual({ type: "text", text: "mira" });
    expect(line.message.content[1].type).toBe("document");
  });
});
