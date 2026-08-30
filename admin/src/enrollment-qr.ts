import QRCode from "qrcode";

export const ENROLLMENT_QR_SIZE = 1600;
const QUIET_ZONE_MODULES = 4;

function uint32(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, false);
  return bytes;
}

function concatBytes(parts: Uint8Array[]) {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data = new Uint8Array()) {
  const typeBytes = new TextEncoder().encode(type);
  const payload = concatBytes([typeBytes, data]);
  return concatBytes([uint32(data.byteLength), payload, uint32(crc32(payload))]);
}

async function deflate(bytes: Uint8Array) {
  const stream = new CompressionStream("deflate");
  const writer = stream.writable.getWriter();
  const input = new Uint8Array(bytes.byteLength);
  input.set(bytes);
  await writer.write(input.buffer);
  await writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

export async function renderEnrollmentQrPng(value: string, width = ENROLLMENT_QR_SIZE) {
  if (!Number.isInteger(width) || width < 256 || width > 2400) throw new Error("Dimensions du QR code invalides.");
  const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
  const moduleCount = qr.modules.size;
  const scale = Math.floor(width / (moduleCount + QUIET_ZONE_MODULES * 2));
  if (scale < 1) throw new Error("Le QR code est trop dense pour cette résolution.");
  const renderedWidth = (moduleCount + QUIET_ZONE_MODULES * 2) * scale;
  const offset = Math.floor((width - renderedWidth) / 2);
  const rowBytes = Math.ceil(width / 8);
  const scanlines = new Uint8Array((rowBytes + 1) * width);

  for (let y = 0; y < width; y += 1) {
    const rowStart = y * (rowBytes + 1);
    scanlines[rowStart] = 0;
    scanlines.fill(0xff, rowStart + 1, rowStart + rowBytes + 1);
  }

  for (let row = 0; row < moduleCount; row += 1) {
    for (let column = 0; column < moduleCount; column += 1) {
      if (!qr.modules.get(row, column)) continue;
      const startX = offset + (column + QUIET_ZONE_MODULES) * scale;
      const startY = offset + (row + QUIET_ZONE_MODULES) * scale;
      for (let y = startY; y < startY + scale; y += 1) {
        const rowStart = y * (rowBytes + 1) + 1;
        for (let x = startX; x < startX + scale; x += 1) {
          scanlines[rowStart + (x >> 3)] &= ~(1 << (7 - (x & 7)));
        }
      }
    }
  }

  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width, false);
  headerView.setUint32(4, width, false);
  header[8] = 1;
  header[9] = 0;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return concatBytes([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", await deflate(scanlines)),
    pngChunk("IEND"),
  ]);
}

export function enrollmentQrFilename(businessName: string) {
  const slug = businessName.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "commerce";
  return `qr-inscription-kivli-${slug}.png`;
}
