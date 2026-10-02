import { inflateSync, deflateSync } from "node:zlib";

const plain = (value) => String(value ?? "")
  .replace(/<\s*br\s*\/?\s*>/gi, "\n")
  .replace(/<\s*\/(p|div|li|h[1-6])\s*>/gi, "\n")
  .replace(/<[^>]*>/g, "")
  .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
  .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(parseInt(value, 16)))
  .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
  .replace(/\r/g, "").trim();

const pdfString = (value) => String(value ?? "").normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^\x20-\x7e]/g, "?")
  .replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");

const jpegSize = (buffer) => {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset++; continue; }
    const marker = buffer[offset + 1];
    if ([0xc0, 0xc1, 0xc2, 0xc3].includes(marker)) {
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5), channels: buffer[offset + 9] };
    }
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) { offset += 2; continue; }
    offset += 2 + buffer.readUInt16BE(offset + 2);
  }
  throw new Error("Unsupported JPEG question image.");
};

const pngRgb = (buffer) => {
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("Unsupported PNG question image.");
  let offset = 8;
  let width = 0, height = 0, colorType = 0, bitDepth = 0;
  const chunks = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    if (type === "IHDR") {
      width = buffer.readUInt32BE(offset + 8);
      height = buffer.readUInt32BE(offset + 12);
      bitDepth = buffer[offset + 16];
      colorType = buffer[offset + 17];
    }
    if (type === "IDAT") chunks.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
    if (type === "IEND") break;
  }
  if (!width || !height || width * height > 24_000_000 || bitDepth !== 8 || ![0, 2, 4, 6].includes(colorType)) throw new Error("Unsupported PNG question image format.");
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  const rowBytes = width * channels;
  const raw = inflateSync(Buffer.concat(chunks));
  const rgb = Buffer.alloc(width * height * 3);
  let sourceOffset = 0, targetOffset = 0;
  let previous = Buffer.alloc(rowBytes);
  for (let row = 0; row < height; row++) {
    const filter = raw[sourceOffset++];
    const current = Buffer.from(raw.subarray(sourceOffset, sourceOffset + rowBytes));
    sourceOffset += rowBytes;
    for (let index = 0; index < rowBytes; index++) {
      const left = index >= channels ? current[index - channels] : 0;
      const up = previous[index];
      const upperLeft = index >= channels ? previous[index - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upperLeft;
        const a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - upperLeft);
        predictor = a <= b && a <= c ? left : b <= c ? up : upperLeft;
      } else if (filter !== 0) throw new Error("Unsupported PNG filter.");
      current[index] = (current[index] + predictor) & 0xff;
    }
    for (let pixel = 0; pixel < width; pixel++) {
      const base = pixel * channels;
      if (colorType === 0 || colorType === 4) rgb.fill(current[base], targetOffset, targetOffset + 3);
      else { rgb[targetOffset] = current[base]; rgb[targetOffset + 1] = current[base + 1]; rgb[targetOffset + 2] = current[base + 2]; }
      targetOffset += 3;
    }
    previous = current;
  }
  return { width, height, data: deflateSync(rgb), filter: "/FlateDecode" };
};

export const createTheoryEvidencePdf = ({ metadata, multipleChoice, essay, images = new Map() }) => {
  const objects = [null, null];
  const add = (value) => { objects.push(value); return objects.length; };
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pages = [];
  const imageObjects = new Map();
  for (const [name, data] of images) {
    let info;
    if (data.subarray(0, 2).toString("hex") === "ffd8") {
      const size = jpegSize(data);
      info = { ...size, data, filter: "/DCTDecode" };
    } else info = pngRgb(data);
    if (info.channels && ![1, 3].includes(info.channels)) throw new Error("Unsupported JPEG color space.");
    const id = add({ header: `<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} /ColorSpace ${info.channels === 1 ? "/DeviceGray" : "/DeviceRGB"} /BitsPerComponent 8 /Filter ${info.filter} /Length ${info.data.length} >>`, data: info.data });
    imageObjects.set(name, { id, width: info.width, height: info.height });
  }
  const xObjects = [...imageObjects].map(([name, image]) => `/${name} ${image.id} 0 R`).join(" ");
  let commands = [], y = 795;
  const newPage = () => {
    if (commands.length) pages.push(commands.join("\n"));
    commands = []; y = 795;
  };
  const line = (text, size = 10, indent = 0) => {
    if (y < 52) newPage();
    commands.push(`BT /F1 ${size} Tf ${48 + indent} ${y} Td (${pdfString(text)}) Tj ET`);
    y -= size + 5;
  };
  const paragraph = (value, size = 10, indent = 0) => {
    const max = Math.floor((495 - indent) / (size * 0.52));
    for (const block of plain(value).split("\n")) {
      let current = "";
      for (const word of block.split(/\s+/).filter(Boolean)) {
        if (word.length > max) {
          if (current) { line(current, size, indent); current = ""; }
          for (let start = 0; start < word.length; start += max) line(word.slice(start, start + max), size, indent);
          continue;
        }
        if (current && `${current} ${word}`.length > max) { line(current, size, indent); current = word; }
        else current = current ? `${current} ${word}` : word;
      }
      if (current) line(current, size, indent);
    }
  };
  const drawImage = (name) => {
    const image = imageObjects.get(name);
    if (!image) return;
    const width = Math.min(450, image.width);
    const height = Math.min(300, width * image.height / image.width);
    if (y - height < 52) newPage();
    y -= height;
    commands.push(`q ${width} 0 0 ${height} 48 ${y} cm /${name} Do Q`);
    y -= 10;
  };
  line("THEORY EXAMINATION EVIDENCE", 16);
  y -= 5;
  for (const [label, value] of Object.entries(metadata)) paragraph(`${label}: ${value ?? "-"}`);
  y -= 8;
  paragraph("Answer keys and model answers are intentionally excluded.", 9);
  y -= 8;
  line("MULTIPLE CHOICE", 13);
  if (!multipleChoice.length) paragraph("No questions recorded.");
  for (const [index, item] of multipleChoice.entries()) {
    y -= 5;
    paragraph(`${index + 1}. ${item.question}`);
    if (item.imageName) drawImage(item.imageName);
    for (const option of item.options) paragraph(`   ${option.label}. ${option.text}${option.selected ? "  [USER ANSWER]" : ""}`, 9, 10);
    if (!item.answered) paragraph("Not answered", 9, 10);
  }
  y -= 10;
  line("ESSAY", 13);
  if (!essay.length) paragraph("No questions recorded.");
  for (const [index, item] of essay.entries()) {
    y -= 5;
    paragraph(`${index + 1}. ${item.question}`);
    if (item.imageName) drawImage(item.imageName);
    paragraph(`Score: ${item.score == null ? "Not scored" : item.score} | Scored by: ${item.checkerName || "Not scored yet"}`, 9);
    paragraph(`User answer: ${item.answer || "Not answered"}`, 9, 10);
  }
  newPage();
  const pageIds = [];
  for (const content of pages) {
    const data = Buffer.from(content, "latin1");
    const contentId = add({ header: `<< /Length ${data.length} >>`, data });
    const pageId = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> /XObject << ${xObjects} >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }
  objects[0] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  const chunks = [Buffer.from("%PDF-1.4\n%\xff\xff\xff\xff\n", "latin1")];
  const offsets = [0];
  let offset = chunks[0].length;
  for (const [index, value] of objects.entries()) {
    const header = Buffer.from(`${index + 1} 0 obj\n`, "latin1");
    const body = typeof value === "string" ? Buffer.from(`${value}\n`, "latin1") : Buffer.concat([Buffer.from(`${value.header}\nstream\n`, "latin1"), value.data, Buffer.from("\nendstream\n", "latin1")]);
    const end = Buffer.from("endobj\n", "latin1");
    offsets.push(offset);
    chunks.push(header, body, end);
    offset += header.length + body.length + end.length;
  }
  const xref = offset;
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((item) => `${String(item).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`, "latin1"));
  return Buffer.concat(chunks);
};
