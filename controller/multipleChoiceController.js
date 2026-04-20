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
        deletedAt: null,
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

    await prisma.multipleChoice.create({
      data: {
        branchUnitId: req.user.branchUnitId,
        question: question,
        a: a,
        b: b,
        c: c,
        d: d,
        image: file? `/uploads/multipleChoice/${file.filename}` : null,
        key: key,
      }
    });
    
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getUpdateMultipleChoiceById = async (req, res) => {
  try {
    const { id } = req.params;
    const { question, a, b, c, d, key } = req.body;
    const files = req.files
    const file = files && files.length > 0 ? files[0] : null

    const existingMultipleChoice = await prisma.multipleChoice.findUnique({
      where: {
        id: parseInt(id),
      },
      select: {
        image: true
      }
    })

    if(file && existingMultipleChoice && existingMultipleChoice.image){
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

    await prisma.multipleChoice.update({
      where: { id: parseInt(id) },
      data: updateData
    });

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

export { getMultipleChoices, addMultipleChoice, getUpdateMultipleChoiceById, deleteMultipleChoiceById };