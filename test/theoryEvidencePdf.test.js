import assert from "node:assert/strict";
import test from "node:test";
import { createTheoryEvidencePdf } from "../services/theoryEvidencePdf.js";

test("theory evidence is PDF with user answers and no key field", () => {
  const pdf = createTheoryEvidencePdf({
    metadata: { Candidate: "MEDAN OPS", Rating: "APP" },
    multipleChoice: [{ question: "Question?", options: [
      { label: "A", text: "First", selected: false },
      { label: "B", text: "Second", selected: true },
    ], answered: true }],
    essay: [{ question: "Explain.", answer: "My answer", score: 80, checkerName: "Checker One" }],
  });
  assert.equal(pdf.subarray(0, 8).toString("latin1"), "%PDF-1.4");
  assert.match(pdf.toString("latin1"), /Second \[USER ANSWER\]/);
  assert.match(pdf.toString("latin1"), /Scored by: Checker One/);
  assert.doesNotMatch(pdf.toString("latin1"), /Correct answer|answer key:/i);
});
