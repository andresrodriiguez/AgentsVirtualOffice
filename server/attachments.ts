import { inflateRawSync } from "node:zlib";
import type { AttachmentInfo } from "../shared/types.ts";
import type { Media } from "./providers.ts";

export const MAX_FILES = 10;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
// Un documento de texto enorme se paga entero en cada llamada: se corta.
const MAX_TEXT_CHARS = 120_000;

const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const TEXT_EXT =
  /\.(txt|md|markdown|csv|tsv|json|jsonl|xml|html?|css|js|jsx|ts|tsx|mjs|cjs|py|rb|go|rs|java|kt|c|h|cpp|cs|php|sh|ps1|bat|sql|ya?ml|toml|ini|env|log|svg)$/i;

export interface Prepared {
  /** Texto de los documentos, listo para ir pegado debajo del mensaje. */
  extra: string;
  media: Media[];
  info: AttachmentInfo[];
}

export class AttachmentError extends Error {}

export function prepareAttachments(value: unknown): Prepared {
  const out: Prepared = { extra: "", media: [], info: [] };
  if (value === undefined || value === null) return out;
  if (!Array.isArray(value)) throw new AttachmentError('"files" tiene que ser una lista');
  if (value.length > MAX_FILES) throw new AttachmentError(`Máximo ${MAX_FILES} adjuntos por mensaje`);
  const texts: string[] = [];
  for (const f of value) {
    if (!f || typeof f !== "object") throw new AttachmentError("Adjunto inválido");
    const { name, mime, data } = f as Record<string, unknown>;
    if (typeof name !== "string" || typeof data !== "string") throw new AttachmentError("Cada adjunto necesita name y data");
    const type = typeof mime === "string" ? mime.toLowerCase() : "";
    const bytes = Buffer.from(data, "base64");
    if (bytes.length > MAX_FILE_BYTES) throw new AttachmentError(`"${name}" pesa más de 20 MB`);
    if (IMAGE_MIMES.has(type)) {
      if (bytes.length > MAX_IMAGE_BYTES) throw new AttachmentError(`La imagen "${name}" pesa más de 5 MB`);
      out.media.push({ name, mime: type, data });
      out.info.push({ name, kind: "image" });
    } else if (type === "application/pdf" || /\.pdf$/i.test(name)) {
      out.media.push({ name, mime: "application/pdf", data });
      out.info.push({ name, kind: "pdf" });
    } else if (type === DOCX_MIME || /\.docx$/i.test(name)) {
      texts.push(fence(name, docxText(bytes, name)));
      out.info.push({ name, kind: "text" });
    } else if (type.startsWith("text/") || type === "application/json" || TEXT_EXT.test(name)) {
      texts.push(fence(name, bytes.toString("utf8")));
      out.info.push({ name, kind: "text" });
    } else {
      throw new AttachmentError(`No puedo leer "${name}". Adjunta imágenes, PDF, Word (.docx) o archivos de texto.`);
    }
  }
  out.extra = texts.join("\n\n");
  return out;
}

function fence(name: string, text: string): string {
  const body = text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}\n[…recortado]` : text;
  return `--- Archivo adjunto: ${name} ---\n${body.trim()}\n--- Fin de ${name} ---`;
}

// Un .docx es un zip: se busca word/document.xml en el directorio central y se le quitan las etiquetas.
export function docxText(zip: Buffer, name = "documento"): string {
  const xml = zipEntry(zip, "word/document.xml");
  if (!xml) throw new AttachmentError(`"${name}" no parece un Word válido`);
  return xml
    .toString("utf8")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n");
}

function zipEntry(zip: Buffer, wanted: string): Buffer | null {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && p + 46 <= zip.length; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) return null;
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const skip = nameLen + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    if (zip.toString("utf8", p + 46, p + 46 + nameLen) === wanted) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      return method === 0 ? data : method === 8 ? inflateRawSync(data) : null;
    }
    p += 46 + skip;
  }
  return null;
}
