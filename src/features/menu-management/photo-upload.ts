import "server-only";

import sharp from "sharp";
import { PublicApiError } from "@/lib/public-table-api";

const maxUpload = 5 * 1024 * 1024;

export async function readProductPhoto(request: Request): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data")) throw new PublicApiError(415, "Selecione uma foto JPG, PNG ou WebP.");
  const reader = request.body?.getReader();
  if (!reader) throw new PublicApiError(400, "Selecione uma foto.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxUpload + 65536) { await reader.cancel(); throw new PublicApiError(413, "A foto deve ter até 5 MB."); }
    chunks.push(value);
  }
  let file: FormDataEntryValue | null;
  try {
    const form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": contentType } }).formData();
    file = form.get("photo");
  } catch { throw new PublicApiError(400, "Não foi possível ler a foto. Selecione o arquivo novamente."); }
  if (!(file instanceof File) || !file.size || file.size > maxUpload) throw new PublicApiError(400, "Selecione uma foto de até 5 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new PublicApiError(415, "Use fotos JPG, PNG ou WebP.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!jpeg && !png && !webp) throw new PublicApiError(415, "O arquivo não é uma foto JPG, PNG ou WebP válida.");
  try {
    const output = await sharp(bytes, { limitInputPixels: 25000000, animated: false })
      .rotate().resize({ width: 1200, height: 900, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    if (output.length > 1000000) throw new Error("Processed image too large");
    return output.toString("base64");
  } catch { throw new PublicApiError(400, "Não foi possível processar a foto. Tente uma imagem menor em JPG, PNG ou WebP."); }
}
