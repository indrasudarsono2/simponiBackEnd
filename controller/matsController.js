import prisma from "../lib/prisma.js";
import fs from "fs";
import sanitizeHtml from "sanitize-html";

const parsePositiveId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const normalizeKey = (value) => String(value || "").trim().toUpperCase();
const cleanQuestion = (value) => sanitizeHtml(String(value || ""), {
  allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "blockquote", "code", "pre"],
  allowedAttributes: {},
});

const detectCsvDelimiter = (content) => {
  const line = content.replace(/^\uFEFF/, "").split(/\r?\n/).find((item) => item.trim()) || "";
  return [",", ";", "\t"].map((delimiter) => {
    let count = 0;
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      if (line[index] === '"') quoted = !quoted;
      else if (line[index] === delimiter && !quoted) count += 1;
    }
    return { delimiter, count };
  }).sort((first, second) => second.count - first.count)[0].delimiter;
};

const parseCsv = (content, delimiter) => {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === '"') {
      if (quoted && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && content[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
};

const parseCsvBoolean = (value, fallback) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["true", "1", "yes", "active"].includes(normalized)) return true;
  if (["false", "0", "no", "inactive"].includes(normalized)) return false;
  return null;
};

const validateQuestion = ({ question, a, b, c, d, key }) => {
  if (!String(question || "").replace(/<[^>]*>/g, "").trim()) return "Question is required.";
  if ([a, b, c, d].some((option) => !String(option || "").trim())) return "Options A, B, C, and D are required.";
  if (!["A", "B", "C", "D"].includes(normalizeKey(key))) return "Answer key must be A, B, C, or D.";
  return null;
};

const getConfiguration = async () => prisma.matsConfiguration.upsert({
  where: { id: 1 },
  update: {},
  create: { id: 1, quantity: 0 },
});

const getMatsQuestions = async (req, res) => {
  try {
    const [configuration, questions] = await Promise.all([
      getConfiguration(),
      prisma.multipleChoice.findMany({
        where: { isMats: true, deletedAt: null },
        select: {
          id: true, question: true, image: true, a: true, b: true, c: true, d: true,
          key: true, isActive: true, createdAt: true, updatedAt: true,
        },
        orderBy: { id: "desc" },
      }),
    ]);
    res.json({ configuration, questions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createMatsQuestion = async (req, res) => {
  try {
    const { question, a, b, c, d, key } = req.body;
    const validationError = validateQuestion({ question, a, b, c, d, key });
    if (validationError) return res.status(400).json({ message: validationError });
    const file = req.files?.[0];
    const created = await prisma.multipleChoice.create({
      data: {
        branchUnitId: null,
        isMats: true,
        question: cleanQuestion(question), a, b, c, d,
        key: normalizeKey(key),
        image: file ? `/uploads/multipleChoice/${file.filename}` : null,
      },
      select: { id: true },
    });
    await prisma.multipleChoice.update({
      where: { id: created.id },
      data: { versionGroupId: created.id },
    });
    res.status(201).json({ success: true, id: created.id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateMatsQuestion = async (req, res) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid MATS question ID." });
    const existing = await prisma.multipleChoice.findFirst({ where: { id, isMats: true, deletedAt: null } });
    if (!existing) return res.status(404).json({ message: "MATS question not found." });
    const values = { ...existing, ...req.body };
    const validationError = validateQuestion(values);
    if (validationError) return res.status(400).json({ message: validationError });
    const file = req.files?.[0];
    const nextIsActive = req.body.isActive == null ? existing.isActive : req.body.isActive === true || req.body.isActive === "true";
    if (existing.isActive && !nextIsActive) {
      const [configuration, activeCount] = await Promise.all([
        getConfiguration(),
        prisma.multipleChoice.count({ where: { isMats: true, isActive: true, deletedAt: null } }),
      ]);
      if (activeCount - 1 < configuration.quantity) {
        return res.status(400).json({ message: "Reduce the configured MATS quantity before deactivating this question." });
      }
    }
    await prisma.multipleChoice.update({
      where: { id },
      data: {
        question: cleanQuestion(values.question), a: values.a, b: values.b, c: values.c, d: values.d,
        key: normalizeKey(values.key),
        isActive: nextIsActive,
        ...(file ? { image: `/uploads/multipleChoice/${file.filename}` } : {}),
      },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteMatsQuestion = async (req, res) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid MATS question ID." });
    const existing = await prisma.multipleChoice.findFirst({ where: { id, isMats: true, deletedAt: null } });
    if (!existing) return res.status(404).json({ message: "MATS question not found." });
    if (existing.isActive) {
      const [configuration, activeCount] = await Promise.all([
        getConfiguration(),
        prisma.multipleChoice.count({ where: { isMats: true, isActive: true, deletedAt: null } }),
      ]);
      if (activeCount - 1 < configuration.quantity) {
        return res.status(400).json({ message: "Reduce the configured MATS quantity before deleting this question." });
      }
    }
    const result = await prisma.multipleChoice.updateMany({
      where: { id, isMats: true, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
    if (result.count === 0) return res.status(404).json({ message: "MATS question not found." });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateMatsConfiguration = async (req, res) => {
  try {
    const quantity = Number(req.body.quantity);
    if (!Number.isInteger(quantity) || quantity < 0) {
      return res.status(400).json({ message: "MATS quantity must be a non-negative integer." });
    }
    const activeCount = await prisma.multipleChoice.count({ where: { isMats: true, isActive: true, deletedAt: null } });
    if (quantity > activeCount) {
      return res.status(400).json({ message: `MATS quantity cannot exceed the ${activeCount} active MATS questions.` });
    }
    const configuration = await prisma.matsConfiguration.upsert({
      where: { id: 1 }, update: { quantity }, create: { id: 1, quantity },
    });
    res.json({ success: true, configuration });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const importMatsQuestionsCsv = async (req, res) => {
  const file = req.files?.[0];
  try {
    if (!file) return res.status(400).json({ message: "CSV file is required." });
    const content = await fs.promises.readFile(file.path, "utf8");
    const rows = parseCsv(content, detectCsvDelimiter(content));
    if (rows.length < 2) {
      return res.status(400).json({ message: "CSV must contain a header and at least one question." });
    }

    const headers = rows[0].map((value) => value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
    const indexes = Object.fromEntries(["matsquestionid", "question", "a", "b", "c", "d", "key", "isactive"].map((name) => [name, headers.indexOf(name)]));
    if (["question", "a", "b", "c", "d", "key"].some((name) => indexes[name] === -1)) {
      return res.status(400).json({ message: "CSV headers must include: matsQuestionId, question, a, b, c, d, key, isActive." });
    }

    const errors = [];
    const items = rows.slice(1).map((row, offset) => {
      const rowNumber = offset + 2;
      const idText = indexes.matsquestionid === -1 ? "" : String(row[indexes.matsquestionid] || "").trim();
      const id = idText ? parsePositiveId(idText) : null;
      const item = {
        rowNumber,
        id,
        question: String(row[indexes.question] || "").trim(),
        a: String(row[indexes.a] || "").trim(),
        b: String(row[indexes.b] || "").trim(),
        c: String(row[indexes.c] || "").trim(),
        d: String(row[indexes.d] || "").trim(),
        key: normalizeKey(row[indexes.key]),
        isActiveText: indexes.isactive === -1 ? "" : row[indexes.isactive],
      };
      if (idText && !id) errors.push(`Row ${rowNumber}: matsQuestionId must be empty or a positive number.`);
      const questionError = validateQuestion(item);
      if (questionError) errors.push(`Row ${rowNumber}: ${questionError}`);
      return item;
    });

    const updateIds = items.filter((item) => item.id).map((item) => item.id);
    const existing = updateIds.length ? await prisma.multipleChoice.findMany({
      where: { id: { in: updateIds }, isMats: true, deletedAt: null },
      select: { id: true, isActive: true },
    }) : [];
    const existingById = new Map(existing.map((item) => [item.id, item]));
    if (new Set(updateIds).size !== updateIds.length) errors.push("Each matsQuestionId may appear only once in the CSV.");
    for (const item of items) {
      if (item.id && !existingById.has(item.id)) errors.push(`Row ${item.rowNumber}: MATS question ${item.id} was not found.`);
      const active = parseCsvBoolean(item.isActiveText, item.id ? existingById.get(item.id)?.isActive : true);
      if (active == null) errors.push(`Row ${item.rowNumber}: isActive must be true/false, yes/no, 1/0, active/inactive, or empty.`);
      item.isActive = active;
    }
    if (errors.length) return res.status(400).json({ message: "CSV validation failed.", errors });

    const [configuration, currentActive] = await Promise.all([
      getConfiguration(),
      prisma.multipleChoice.count({ where: { isMats: true, isActive: true, deletedAt: null } }),
    ]);
    const activeDelta = items.reduce((total, item) => {
      const previous = item.id ? existingById.get(item.id).isActive : false;
      return total + Number(item.isActive) - Number(previous);
    }, 0);
    if (currentActive + activeDelta < configuration.quantity) {
      return res.status(400).json({ message: "Import would leave fewer active MATS questions than the configured examination quantity." });
    }

    let created = 0;
    let updated = 0;
    await prisma.$transaction(async (transaction) => {
      for (const item of items) {
        const data = { question: cleanQuestion(item.question), a: item.a, b: item.b, c: item.c, d: item.d, key: item.key, isActive: item.isActive };
        if (item.id) {
          await transaction.multipleChoice.update({ where: { id: item.id }, data });
          updated += 1;
        } else {
          const question = await transaction.multipleChoice.create({
            data: { ...data, branchUnitId: null, isMats: true }, select: { id: true },
          });
          await transaction.multipleChoice.update({ where: { id: question.id }, data: { versionGroupId: question.id } });
          created += 1;
        }
      }
    });
    res.status(201).json({ success: true, imported: items.length, created, updated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getMatsQuestions, createMatsQuestion, updateMatsQuestion, deleteMatsQuestion, updateMatsConfiguration, importMatsQuestionsCsv };
