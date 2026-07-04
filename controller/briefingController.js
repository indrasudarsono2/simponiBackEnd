import prisma from "../lib/prisma.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import fs from "fs";
import path from "path";

dayjs.extend(utc);

const sanitizeHtml = (value = "") => String(value).trim();
const briefingInclude = {
  speakerUser: {
    select: {
      name: true,
    },
  },
  contentOfBriefings: true,
  briefingDestinations: {
    include: {
      professionInBranch: {
        select: {
          id: true,
          profession: {
            select: {
              profession: true,
            },
          },
        },
      },
    },
  },
};

const parseProfessionInBranchIds = (value) => {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string" && value.length > 0
      ? [value]
      : [];

  return [
    ...new Set(
      rawValues
        .flatMap((item) => String(item).split(","))
        .map((item) => parseInt(item, 10))
        .filter(Number.isInteger),
    ),
  ];
};

const getUploadedFile = (req) => {
  const files = req.files;
  return files && files.length > 0 ? files[0] : null;
};

const deleteFileIfExists = (filePath) => {
  if (!filePath) return;

  const normalizedPath = filePath.startsWith("/")
    ? filePath.slice(1)
    : filePath;
  const absolutePath = path.join(process.cwd(), normalizedPath);

  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
};

const getBriefings = async (req, res) => {
  try {
    const branchId = req.user?.branchId ?? 6;
    const start = dayjs.utc(req.body.start).toDate();
    const finish = dayjs.utc(req.body.finish).toDate();
    const briefings = await prisma.briefing.findMany({
      where: {
        branchId,
        kindOfBriefingId: 1,
        deletedAt: null,
        createdAt: {
          gte: start,
          lte: finish,
        },
      },
      include: briefingInclude,
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(briefings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addBriefing = async (req, res) => {
  try {
    const branchId = req.user?.branchId;
    const speaker = req.user?.nik;
    const professionInBranchIds = parseProfessionInBranchIds(
      req.body.professionInBranchIds,
    );
    const contentOfBriefing = sanitizeHtml(req.body.contentOfBriefing);
    const file = getUploadedFile(req);
    const filePath = file ? `/uploads/briefing/${file.filename}` : null;

    if (!branchId || !speaker) {
      return res.status(401).json({
        success: false,
        message: "Authentication data is missing.",
      });
    }

    if (professionInBranchIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one profession destination.",
      });
    }

    if (!contentOfBriefing) {
      return res.status(400).json({
        success: false,
        message: "Briefing content is required.",
      });
    }

    const validDestinations = await prisma.professionInBranch.findMany({
      where: {
        id: {
          in: professionInBranchIds,
        },
        branchId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (validDestinations.length !== professionInBranchIds.length) {
      return res.status(400).json({
        success: false,
        message: "One or more selected destinations are invalid for this branch.",
      });
    }

    const briefing = await prisma.briefing.create({
      data: {
        branchId,
        speaker,
        kindOfBriefingId: 1,
        isAll: false,
        contentOfBriefings: {
          create: {
            contentOfBriefing,
            file: filePath,
          },
        },
        briefingDestinations: {
          create: professionInBranchIds.map((professionInBranchId) => ({
            professionInBranchId,
          })),
        },
      },
      include: briefingInclude,
    });

    res.status(201).json({
      success: true,
      briefing,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateBriefing = async (req, res) => {
  try {
    const branchId = req.user?.branchId;
    const speaker = req.user?.nik;
    const briefingId = parseInt(req.params.id, 10);
    const professionInBranchIds = parseProfessionInBranchIds(
      req.body.professionInBranchIds,
    );
    const contentOfBriefing = sanitizeHtml(req.body.contentOfBriefing);
    const file = getUploadedFile(req);

    if (!branchId || !speaker) {
      return res.status(401).json({
        success: false,
        message: "Authentication data is missing.",
      });
    }

    if (!Number.isInteger(briefingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid briefing ID.",
      });
    }

    if (professionInBranchIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one profession destination.",
      });
    }

    if (!contentOfBriefing) {
      return res.status(400).json({
        success: false,
        message: "Briefing content is required.",
      });
    }

    const briefing = await prisma.briefing.findFirst({
      where: {
        id: briefingId,
        branchId,
        kindOfBriefingId: 1,
        deletedAt: null,
      },
      select: {
        id: true,
        contentOfBriefings: {
          select: {
            file: true,
          },
        },
      },
    });

    if (!briefing) {
      return res.status(404).json({
        success: false,
        message: "Briefing not found.",
      });
    }

    const validDestinations = await prisma.professionInBranch.findMany({
      where: {
        id: {
          in: professionInBranchIds,
        },
        branchId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (validDestinations.length !== professionInBranchIds.length) {
      return res.status(400).json({
        success: false,
        message: "One or more selected destinations are invalid for this branch.",
      });
    }

    const existingFilePath = briefing.contentOfBriefings?.[0]?.file || null;
    const nextFilePath = file ? `/uploads/briefing/${file.filename}` : existingFilePath;

    if (file && existingFilePath) {
      deleteFileIfExists(existingFilePath);
    }

    const updatedBriefing = await prisma.briefing.update({
      where: {
        id: briefingId,
      },
      data: {
        speaker,
        contentOfBriefings: {
          deleteMany: {},
          create: {
            contentOfBriefing,
            file: nextFilePath,
          },
        },
        briefingDestinations: {
          deleteMany: {},
          create: professionInBranchIds.map((professionInBranchId) => ({
            professionInBranchId,
          })),
        },
      },
      include: briefingInclude,
    });

    res.json({
      success: true,
      briefing: updatedBriefing,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteBriefing = async (req, res) => {
  try {
    const branchId = req.user?.branchId;
    const briefingId = parseInt(req.params.id, 10);

    if (!branchId) {
      return res.status(401).json({
        success: false,
        message: "Authentication data is missing.",
      });
    }

    if (!Number.isInteger(briefingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid briefing ID.",
      });
    }

    const briefing = await prisma.briefing.findFirst({
      where: {
        id: briefingId,
        branchId,
        kindOfBriefingId: 1,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!briefing) {
      return res.status(404).json({
        success: false,
        message: "Briefing not found.",
      });
    }

    await prisma.briefing.update({
      where: {
        id: briefingId,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    res.json({
      success: true,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getBriefings, addBriefing, updateBriefing, deleteBriefing };
