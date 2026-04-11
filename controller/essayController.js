import prisma from "../lib/prisma.js";
import config from "../utils/config.json";

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
    const { question, answer, image, value } = req.body;

    await prisma.essay.create({
      data: {
        branchUnitId: req.user.branchUnitId,
        question: question,
        answer: answer,
        image: image,
        value: value,
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
    const { question, answer, image, value } = req.body;

    await prisma.essay.update({
      where: { id: parseInt(id) },
      data: {
        question: question,
        answer: answer,
        image: image,
        value: value
      }
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