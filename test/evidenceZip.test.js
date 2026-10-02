import assert from "node:assert/strict";
import test from "node:test";
import { inflateRawSync } from "node:zlib";
import { createEvidenceZip } from "../services/evidenceZip.js";

test("evidence ZIP contains readable files inside one application/rating folder", () => {
  const archive = createEvidenceZip([
    { name: "application-1/rating-2/manifest.json", data: Buffer.from('{"ok":true}') },
    { name: "application-1/rating-2/theory/examination.html", data: Buffer.from("<h1>Review</h1>") },
  ]);
  let offset = 0;
  for (const expected of ["{\"ok\":true}", "<h1>Review</h1>"]) {
    assert.equal(archive.readUInt32LE(offset), 0x04034b50);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const nameLength = archive.readUInt16LE(offset + 26);
    const dataStart = offset + 30 + nameLength;
    assert.equal(inflateRawSync(archive.subarray(dataStart, dataStart + compressedSize)).toString(), expected);
    offset = dataStart + compressedSize;
  }
  assert.equal(archive.readUInt32LE(offset), 0x02014b50);
  assert.equal(archive.readUInt32LE(archive.length - 22), 0x06054b50);
  assert.equal(archive.readUInt16LE(archive.length - 22 + 10), 2);
});

test("evidence ZIP rejects traversal and duplicate paths", () => {
  assert.throws(() => createEvidenceZip([{ name: "../secret", data: "x" }]));
  assert.throws(() => createEvidenceZip([{ name: "a/file", data: "x" }, { name: "a/file", data: "y" }]));
});
