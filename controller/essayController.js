import prisma from "../lib/prisma.js";
import config from "../utils/config.json";
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

    await prisma.essay.create({
      data: {
        branchUnitId: req.user.branchUnitId,
        question: question,
        answer: answer,
        value: parseInt(value),
        image: file? `/uploads/essay/${file.filename}` : null
      }
    });
    
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getUpdateEssayById = async (req, res) => {
  try {
    const { id } = req.params;
    const { question, answer, value } = req.body;
    const files = req.files
    const file = files && files.length > 0 ? files[0] : null

    const existingEssay = await prisma.essay.findUnique({
      where: {
        id: parseInt(id),
      },
      select: {
        image: true
      }
    })
    
    if(file && existingEssay && existingEssay.image){
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

    await prisma.essay.update({
      where: { id: parseInt(id) },
      data: updateData
    });
    
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

export { getEssays, addEssays, getUpdateEssayById, deleteEssayById };
