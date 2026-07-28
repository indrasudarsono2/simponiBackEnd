import prisma from "../lib/prisma.js";
import config from "../utils/config.json";
import fs from "fs";
import path from "path";

const getMultipleChoices = async (req, res) => {
  // const branchUnitId = 17
    const branchUnitId = req.user.branchUnitId
  try {
    const multipleChoice = await prisma.multipleChoice.findMany({
      where: {
        branchUnitId: branchUnitId,
        isMats: false,
        deletedAt: null,
        isActive: true,
      }
    })

    const sector = await prisma.sector.findMany({
      where: {
        branchUnitId: branchUnitId,
        deletedAt: null,
      },
      select: {
        id: true,
        sector: true,
        subBranchUnitRatings: {
          select: {
            id: true,
          }
        },
        branchUnit: {
          select: {
            unit: true,
            branch: {
              select: {
                branch: true
              }
            }
          }
        }
      }
    })
    
    // Logic to fetch regions (e.g., from a database)
    res.json({multipleChoice, sector});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addMultipleChoice = async (req, res) => {
  try {
    const { question, a, b, c, d, key } = req.body;
    const files = req.files
    const file = files && files.length > 0 ? files[0] : null

    const createdMultipleChoice = await prisma.multipleChoice.create({
      data: {
        branchUnitId: req.user.branchUnitId,
        isMats: false,
        question: question,
        a: a,
        b: b,
        c: c,
        d: d,
        image: file? `/uploads/multipleChoice/${file.filename}` : null,
        key: key,
      }
    });

    await prisma.multipleChoice.update({
      where: {
        id: createdMultipleChoice.id,
      },
      data: {
        versionGroupId: createdMultipleChoice.id,
      },
    });
    
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const stripBom = (value = "") => value.replace(/^\uFEFF/, "");

const countDelimiter = (line = "", delimiter = ",") => {
  let count = 0;
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) count += 1;
  }

  return count;
};

const detectCsvDelimiter = (content = "") => {
  const firstLine = content.split(/\r?\n/).find((line) => line.trim() !== "") || "";
  const delimiters = [",", ";", "\t"];

  return delimiters
    .map((delimiter) => ({
      delimiter,
      count: countDelimiter(firstLine, delimiter),
    }))
    .sort((first, second) => second.count - first.count)[0].delimiter;
};

const parseCsv = (content = "", delimiter = ",") => {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") index += 1;
      row.push(field);
      if (row.some((item) => item.trim() !== "")) rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((item) => item.trim() !== "")) rows.push(row);

  return rows;
};

const normalizeHeader = (value = "") =>
  stripBom(value).trim().toLowerCase().replace(/\s+/g, "");

const parseWholeNumber = (value = "") => {
  const trimmed = String(value).trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
};

const normalizeKey = (value = "") => String(value).trim().toUpperCase();

const isMultipleChoiceUsed = async (multipleChoiceId) => {
  const correctionCount = await prisma.multipleChoiceCorrection.count({
    where: {
      multipleChoiceId,
      deletedAt: null,
    },
  });

  return correctionCount > 0;
};

const createMultipleChoiceVersion = async (tx, existingMultipleChoice, data) => {
  const now = new Date();
  const versionGroupId =
    existingMultipleChoice.versionGroupId || existingMultipleChoice.id;

  await tx.multipleChoice.update({
    where: {
      id: existingMultipleChoice.id,
    },
    data: {
      isActive: false,
    },
  });

  const newMultipleChoice = await tx.multipleChoice.create({
    data: {
      branchUnitId: existingMultipleChoice.branchUnitId,
      parentMultipleChoiceId: existingMultipleChoice.id,
      versionGroupId,
      version: (existingMultipleChoice.version || 1) + 1,
      isActive: true,
      question: data.question,
      a: data.a,
      b: data.b,
      c: data.c,
      d: data.d,
      key: data.key,
      image: data.image ?? existingMultipleChoice.image ?? null,
    },
  });

  const activeAssignments = await tx.mcQuestionGroup.findMany({
    where: {
      multipleChoiceId: existingMultipleChoice.id,
      deletedAt: null,
    },
    select: {
      id: true,
      questionGroupId: true,
      sectorId: true,
    },
  });

  if (activeAssignments.length > 0) {
    await tx.mcQuestionGroup.updateMany({
      where: {
        id: {
          in: activeAssignments.map((assignment) => assignment.id),
        },
      },
      data: {
        deletedAt: now,
      },
    });

    await tx.mcQuestionGroup.createMany({
      data: activeAssignments.map((assignment) => ({
        multipleChoiceId: newMultipleChoice.id,
        questionGroupId: assignment.questionGroupId,
        sectorId: assignment.sectorId,
      })),
    });
  }

  return newMultipleChoice;
};

const importMultipleChoicesCsv = async (req, res) => {
  const file = req.files && req.files.length > 0 ? req.files[0] : null;

  try {
    if (!file) {
      return res.status(400).json({ message: "CSV file is required." });
    }

    const content = await fs.promises.readFile(file.path, "utf8");
    const delimiter = detectCsvDelimiter(content);
    const rows = parseCsv(content, delimiter);

    if (rows.length < 2) {
      return res.status(400).json({
        message: "CSV must contain a header row and at least one question row.",
      });
    }

    const headers = rows[0].map(normalizeHeader);
    const idIndex = headers.indexOf("multiplechoiceid");
    const questionIndex = headers.indexOf("question");
    const aIndex = headers.indexOf("a");
    const bIndex = headers.indexOf("b");
    const cIndex = headers.indexOf("c");
    const dIndex = headers.indexOf("d");
    const keyIndex = headers.indexOf("key");

    if (
      questionIndex === -1 ||
      aIndex === -1 ||
      bIndex === -1 ||
      cIndex === -1 ||
      dIndex === -1 ||
      keyIndex === -1
    ) {
      return res.status(400).json({
        message: "CSV headers must be: multipleChoiceId, question, a, b, c, d, key.",
      });
    }

    const errors = [];
    const itemsToCreate = [];
    const itemsToUpdate = [];

    rows.slice(1).forEach((row, index) => {
      const rowNumber = index + 2;
      const idText = idIndex === -1 ? "" : (row[idIndex] || "").trim();
      const multipleChoiceId = idText ? parseWholeNumber(idText) : null;
      const question = (row[questionIndex] || "").trim();
      const a = (row[aIndex] || "").trim();
      const b = (row[bIndex] || "").trim();
      const c = (row[cIndex] || "").trim();
      const d = (row[dIndex] || "").trim();
      const key = normalizeKey(row[keyIndex] || "");

      if (idText && !multipleChoiceId) {
        errors.push(`Row ${rowNumber}: multipleChoiceId must be empty or a valid number.`);
      }

      if (!question || question.replace(/<[^>]*>/g, "").trim().length < 5) {
        errors.push(`Row ${rowNumber}: question must be at least 5 characters.`);
      }

      if (!a) errors.push(`Row ${rowNumber}: option A is required.`);
      if (!b) errors.push(`Row ${rowNumber}: option B is required.`);
      if (!c) errors.push(`Row ${rowNumber}: option C is required.`);
      if (!d) errors.push(`Row ${rowNumber}: option D is required.`);
      if (!["A", "B", "C", "D"].includes(key)) {
        errors.push(`Row ${rowNumber}: key must be A, B, C, or D.`);
      }

      const payload = {
        rowNumber,
        multipleChoiceId,
        question,
        a,
        b,
        c,
        d,
        key,
      };

      if (multipleChoiceId) {
        itemsToUpdate.push(payload);
      } else {
        itemsToCreate.push({
          branchUnitId: req.user.branchUnitId,
          question,
          a,
          b,
          c,
          d,
          key,
          image: null,
        });
      }
    });

    if (itemsToUpdate.length > 0) {
      const updateIds = itemsToUpdate.map((item) => item.multipleChoiceId);
      const existingItems = await prisma.multipleChoice.findMany({
        where: {
          id: {
            in: updateIds,
          },
          branchUnitId: req.user.branchUnitId,
          deletedAt: null,
        },
        select: {
          id: true,
          branchUnitId: true,
          parentMultipleChoiceId: true,
          versionGroupId: true,
          version: true,
          isActive: true,
          image: true,
        },
      });
      const existingIds = new Set(existingItems.map((item) => item.id));

      for (const item of itemsToUpdate) {
        if (!existingIds.has(item.multipleChoiceId)) {
          errors.push(
            `Row ${item.rowNumber}: multipleChoiceId ${item.multipleChoiceId} was not found in your branch unit.`,
          );
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        message: "CSV validation failed.",
        errors,
      });
    }

    const updateIds = itemsToUpdate.map((item) => item.multipleChoiceId);
    const existingItemsForUpdate = updateIds.length
      ? await prisma.multipleChoice.findMany({
          where: {
            id: {
              in: updateIds,
            },
            branchUnitId: req.user.branchUnitId,
            deletedAt: null,
          },
          select: {
            id: true,
            branchUnitId: true,
            parentMultipleChoiceId: true,
            versionGroupId: true,
            version: true,
            isActive: true,
            image: true,
          },
        })
      : [];
    const existingItemMap = new Map(
      existingItemsForUpdate.map((item) => [item.id, item]),
    );
    const usedMultipleChoiceIds = new Set();

    for (const item of itemsToUpdate) {
      if (await isMultipleChoiceUsed(item.multipleChoiceId)) {
        usedMultipleChoiceIds.add(item.multipleChoiceId);
      }
    }

    await prisma.$transaction(async (tx) => {
      if (itemsToCreate.length > 0) {
        for (const item of itemsToCreate) {
          const createdMultipleChoice = await tx.multipleChoice.create({
            data: item,
          });
          await tx.multipleChoice.update({
            where: {
              id: createdMultipleChoice.id,
            },
            data: {
              versionGroupId: createdMultipleChoice.id,
            },
          });
        }
      }

      for (const item of itemsToUpdate) {
        const existingMultipleChoice = existingItemMap.get(item.multipleChoiceId);

        if (usedMultipleChoiceIds.has(item.multipleChoiceId)) {
          await createMultipleChoiceVersion(tx, existingMultipleChoice, {
            question: item.question,
            a: item.a,
            b: item.b,
            c: item.c,
            d: item.d,
            key: item.key,
          });
        } else {
          await tx.multipleChoice.update({
            where: {
              id: item.multipleChoiceId,
            },
            data: {
              question: item.question,
              a: item.a,
              b: item.b,
              c: item.c,
              d: item.d,
              key: item.key,
            },
          });
        }
      }
    });

    res.status(200).json({
      success: true,
      imported: itemsToCreate.length + itemsToUpdate.length,
      created: itemsToCreate.length,
      updated: itemsToUpdate.length - usedMultipleChoiceIds.size,
      versioned: usedMultipleChoiceIds.size,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  } finally {
    if (file?.path && fs.existsSync(file.path)) {
      await fs.promises.unlink(file.path);
    }
  }
};

const getUpdateMultipleChoiceById = async (req, res) => {
  try {
    const { id } = req.params;
    const { question, a, b, c, d, key } = req.body;
    const files = req.files
    const file = files && files.length > 0 ? files[0] : null

    const existingMultipleChoice = await prisma.multipleChoice.findFirst({
      where: {
        id: parseInt(id),
        branchUnitId: req.user.branchUnitId,
        deletedAt: null,
      },
      select: {
        id: true,
        branchUnitId: true,
        parentMultipleChoiceId: true,
        versionGroupId: true,
        version: true,
        isActive: true,
        image: true
      }
    })

    if (!existingMultipleChoice) {
      return res.status(404).json({ message: "Multiple choice question not found." });
    }

    const multipleChoiceHasBeenUsed = await isMultipleChoiceUsed(existingMultipleChoice.id);

    if(file && !multipleChoiceHasBeenUsed && existingMultipleChoice && existingMultipleChoice.image){
      const oldImage = path.join(process.cwd(), existingMultipleChoice.image)
      if(fs.existsSync(oldImage)){
        await fs.promises.unlink(oldImage)
      }
    }

    const updateData = {
      question: question,
        a: a,
        b: b,
        c: c,
        d: d,
        key: key
    }

    if(file){
      updateData.image = `/uploads/multipleChoice/${file.filename}`
    }

    if (multipleChoiceHasBeenUsed) {
      await prisma.$transaction(async (tx) => {
        await createMultipleChoiceVersion(tx, existingMultipleChoice, updateData);
      });
    } else {
      await prisma.multipleChoice.update({
        where: { id: parseInt(id) },
        data: updateData
      });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteMultipleChoiceById = async (req, res) => {
  try {
    const now = new Date();
    const { id } = req.params;
   
    await prisma.multipleChoice.update({
      where: { id: parseInt(id) },
      data: { deletedAt: now }
    });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getMultipleChoices, addMultipleChoice, importMultipleChoicesCsv, getUpdateMultipleChoiceById, deleteMultipleChoiceById };
