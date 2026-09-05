import prisma from "../lib/prisma.js";
import config from "../utils/config.js";
import fs from "fs";
import path from "path";

const getEssays = async (req, res) => {
  // const branchUnitId = 17
    const branchUnitId = req.user.branchUnitId
  try {
    const essay = await prisma.essay.findMany({
      where: {
        branchUnitId: branchUnitId,
        deletedAt: null,
        isActive: true,
      },
      orderBy: {
        id: "desc"
      },
    })
    
    const branchUnit = await prisma.branchUnit.findUnique({
      where: {
        id: parseInt(branchUnitId)
      },
      select: {
        unit: true,
        branch: {
          select: {
            branch: true
          }
        }
      }
    })
    // Logic to fetch regions (e.g., from a database)
    res.json({branchUnit,essay});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addEssays = async (req, res) => {
  try {
    const { question, answer, value } = req.body;
    const files = req.files
    const file = files && files.length > 0 ? files[0] : null

    const createdEssay = await prisma.essay.create({
      data: {
        branchUnitId: req.user.branchUnitId,
        question: question,
        answer: answer,
        value: parseInt(value),
        image: file? `/uploads/essay/${file.filename}` : null
      }
    });

    await prisma.essay.update({
      where: {
        id: createdEssay.id,
      },
      data: {
        versionGroupId: createdEssay.id,
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

const isEssayUsed = async (essayId) => {
  const correctionCount = await prisma.essayCorrection.count({
    where: {
      essayId,
      deletedAt: null,
    },
  });

  return correctionCount > 0;
};

const createEssayVersion = async (tx, existingEssay, data) => {
  const now = new Date();
  const versionGroupId = existingEssay.versionGroupId || existingEssay.id;

  await tx.essay.update({
    where: {
      id: existingEssay.id,
    },
    data: {
      isActive: false,
    },
  });

  const newEssay = await tx.essay.create({
    data: {
      branchUnitId: existingEssay.branchUnitId,
      parentEssayId: existingEssay.id,
      versionGroupId,
      version: (existingEssay.version || 1) + 1,
      isActive: true,
      question: data.question,
      answer: data.answer,
      value: data.value,
      image: data.image ?? existingEssay.image ?? null,
    },
  });

  const activeAssignments = await tx.essayQuestionGroup.findMany({
    where: {
      essayId: existingEssay.id,
      deletedAt: null,
    },
    select: {
      id: true,
      questionGroupId: true,
      sectorId: true,
    },
  });

  if (activeAssignments.length > 0) {
    await tx.essayQuestionGroup.updateMany({
      where: {
        id: {
          in: activeAssignments.map((assignment) => assignment.id),
        },
      },
      data: {
        deletedAt: now,
      },
    });

    await tx.essayQuestionGroup.createMany({
      data: activeAssignments.map((assignment) => ({
        essayId: newEssay.id,
        questionGroupId: assignment.questionGroupId,
        sectorId: assignment.sectorId,
      })),
    });
  }

  return newEssay;
};

const importEssaysCsv = async (req, res) => {
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
        message: "CSV must contain a header row and at least one essay row.",
      });
    }

    const headers = rows[0].map(normalizeHeader);
    const essayIdIndex = headers.indexOf("essayid");
    const questionIndex = headers.indexOf("question");
    const answerIndex = headers.indexOf("answer");
    const valueIndex = headers.indexOf("value");

    if (questionIndex === -1 || answerIndex === -1 || valueIndex === -1) {
      return res.status(400).json({
        message: "CSV headers must be: essayId, question, answer, value.",
      });
    }

    const errors = [];
    const essaysToCreate = [];
    const essaysToUpdate = [];

    rows.slice(1).forEach((row, index) => {
      const rowNumber = index + 2;
      const essayIdText =
        essayIdIndex === -1 ? "" : (row[essayIdIndex] || "").trim();
      const essayId = essayIdText ? parseWholeNumber(essayIdText) : null;
      const question = (row[questionIndex] || "").trim();
      const answer = (row[answerIndex] || "").trim();
      const value = parseWholeNumber(row[valueIndex] || "");

      if (essayIdText && !essayId) {
        errors.push(`Row ${rowNumber}: essayId must be empty or a valid number.`);
      }

      if (!question || question.replace(/<[^>]*>/g, "").trim().length < 10) {
        errors.push(`Row ${rowNumber}: question must be at least 10 characters.`);
      }

      if (!answer || answer.replace(/<[^>]*>/g, "").trim().length < 5) {
        errors.push(`Row ${rowNumber}: answer must be at least 5 characters.`);
      }

      if (!value || value < 1) {
        errors.push(`Row ${rowNumber}: value must be a whole number at least 1.`);
      }

      const essayData = {
        rowNumber,
        essayId,
        question,
        answer,
        value,
      };

      if (essayId) {
        essaysToUpdate.push(essayData);
      } else {
        essaysToCreate.push({
          branchUnitId: req.user.branchUnitId,
          question,
          answer,
          value,
          image: null,
        });
      }
    });

    if (essaysToUpdate.length > 0) {
      const updateIds = essaysToUpdate.map((essay) => essay.essayId);
      const existingEssays = await prisma.essay.findMany({
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
          parentEssayId: true,
          versionGroupId: true,
          version: true,
          isActive: true,
          image: true,
        },
      });
      const existingEssayIds = new Set(existingEssays.map((essay) => essay.id));

      for (const essay of essaysToUpdate) {
        if (!existingEssayIds.has(essay.essayId)) {
          errors.push(
            `Row ${essay.rowNumber}: essayId ${essay.essayId} was not found in your branch unit.`,
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

    const updateIds = essaysToUpdate.map((essay) => essay.essayId);
    const existingEssaysForUpdate = updateIds.length
      ? await prisma.essay.findMany({
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
            parentEssayId: true,
            versionGroupId: true,
            version: true,
            isActive: true,
            image: true,
          },
        })
      : [];
    const existingEssayMap = new Map(
      existingEssaysForUpdate.map((essay) => [essay.id, essay]),
    );
    const usedEssayIds = new Set();

    for (const essay of essaysToUpdate) {
      if (await isEssayUsed(essay.essayId)) {
        usedEssayIds.add(essay.essayId);
      }
    }

    await prisma.$transaction(async (tx) => {
      if (essaysToCreate.length > 0) {
        for (const essay of essaysToCreate) {
          const createdEssay = await tx.essay.create({
            data: essay,
          });
          await tx.essay.update({
            where: {
              id: createdEssay.id,
            },
            data: {
              versionGroupId: createdEssay.id,
            },
          });
        }
      }

      for (const essay of essaysToUpdate) {
        const existingEssay = existingEssayMap.get(essay.essayId);

        if (usedEssayIds.has(essay.essayId)) {
          await createEssayVersion(tx, existingEssay, {
            question: essay.question,
            answer: essay.answer,
            value: essay.value,
          });
        } else {
          await tx.essay.update({
            where: {
              id: essay.essayId,
            },
            data: {
              question: essay.question,
              answer: essay.answer,
              value: essay.value,
            },
          });
        }
      }
    });

    res.status(200).json({
      success: true,
      imported: essaysToCreate.length + essaysToUpdate.length,
      created: essaysToCreate.length,
      updated: essaysToUpdate.length - usedEssayIds.size,
      versioned: usedEssayIds.size,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  } finally {
    if (file?.path && fs.existsSync(file.path)) {
      await fs.promises.unlink(file.path);
    }
  }
};

const getUpdateEssayById = async (req, res) => {
  try {
    const { id } = req.params;
    const { question, answer, value } = req.body;
    const files = req.files
    const file = files && files.length > 0 ? files[0] : null

    const existingEssay = await prisma.essay.findFirst({
      where: {
        id: parseInt(id),
        branchUnitId: req.user.branchUnitId,
        deletedAt: null,
      },
      select: {
        id: true,
        branchUnitId: true,
        parentEssayId: true,
        versionGroupId: true,
        version: true,
        isActive: true,
        image: true
      }
    })

    if (!existingEssay) {
      return res.status(404).json({ message: "Essay not found." });
    }

    const essayHasBeenUsed = await isEssayUsed(existingEssay.id);
    
    if(file && !essayHasBeenUsed && existingEssay && existingEssay.image){
      const oldImage = path.join(process.cwd(), existingEssay.image)
      if(fs.existsSync(oldImage)){
        await fs.promises.unlink(oldImage)
      }
    }

    const updateData = {
      question: question,
      answer: answer,
      value: parseInt(value),
    }

    if(file){
      updateData.image = `/uploads/essay/${file.filename}`
    }

    if (essayHasBeenUsed) {
      await prisma.$transaction(async (tx) => {
        await createEssayVersion(tx, existingEssay, updateData);
      });
    } else {
      await prisma.essay.update({
        where: { id: parseInt(id) },
        data: updateData
      });
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteEssayById = async (req, res) => {
  try {
    const now = new Date();
    const { id } = req.params;
   
    await prisma.essay.update({
      where: { id: parseInt(id) },
      data: { deletedAt: now }
    });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getEssays, addEssays, importEssaysCsv, getUpdateEssayById, deleteEssayById };
