import { codepages } from "./codepages.ts";
import { wrapText, type PrintDocument, type PrintDevice } from "./document.ts";

export function encodePrintText(text: string, codepage: keyof typeof codepages): Uint8Array {
  const table = codepages[codepage];
  if (!table) throw new Error("Unsupported character table");
  return Uint8Array.from(Array.from(text.normalize("NFC"), (char) => {
    const value = char.codePointAt(0)!;
    if (value >= 32 && value <= 126) return value;
    if (char === "\n") return 10;
    const index = table.indexOf(char);
    return index === -1 ? 63 : 128 + index;
  }));
}

export function renderEscPos(document: PrintDocument, device: Pick<PrintDevice, "codepage" | "codepage_number">): Uint8Array {
  if (!Number.isInteger(device.codepage_number) || device.codepage_number < 0 || device.codepage_number > 255) throw new Error("Invalid codepage number");
  const bytes: number[] = [27, 64, 27, 116, device.codepage_number];
  for (const block of document.blocks) {
    if (block.type === "text") {
      bytes.push(27, 97, block.center ? 1 : 0, 27, 69, block.bold ? 1 : 0, 29, 33, block.large ? 17 : 0);
      for (const line of wrapText(block.text, block.large ? Math.floor(document.columns / 2) : document.columns)) bytes.push(...encodePrintText(line, device.codepage), 10);
      bytes.push(29, 33, 0, 27, 69, 0, 27, 97, 0);
    } else if (block.type === "rule") bytes.push(...encodePrintText("-".repeat(document.columns) + "\n", device.codepage));
    else if (block.type === "qr") {
      const payload = new TextEncoder().encode(block.value);
      if (payload.length > 2048) throw new Error("QR value too long");
      const length = payload.length + 3;
      bytes.push(27, 97, 1, 29, 40, 107, 4, 0, 49, 65, 50, 0, 29, 40, 107, 3, 0, 49, 67, document.paperMm === 58 ? 4 : 6,
        29, 40, 107, 3, 0, 49, 69, 48, 29, 40, 107, length % 256, Math.floor(length / 256), 49, 80, 48, ...payload,
        29, 40, 107, 3, 0, 49, 81, 48, 10, 27, 97, 0);
    } else bytes.push(10, 10, 10, 29, 86, 0);
  }
  return Uint8Array.from(bytes);
}
