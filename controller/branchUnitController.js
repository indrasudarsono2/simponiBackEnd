import prisma from "../lib/prisma.js";
import config from "../utils/config.json";

const getBranchUnits = async (req, res) => {
  try {
   const branchUnits = await prisma.branchUnit.findMany({
      where: {
        branchId: req.user.branchId,  
        deletedAt: null
      },
      include: {
        branch: true
      }
    });
    
  
    res.json(branchUnits);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const branchUnitsGetBranch = async (req, res) => {
  try {
    const branch = await prisma.branch.findFirst({
    where: {
      id: req.user.branchId
    }
  });
    res.json(branch);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const addBranchUnit = async (req, res) => {
  try {
    const { unit, branch,branchId } = req.body;
    
    await prisma.branchUnit.create({
      data: {
        branchId: parseInt(branchId),
        unit: unit
      }
    });
  
    res.status(201).json({ success: true, message: `Branch Unit ${unit} added` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getBranchUnitById = async (req, res) => {
  try {
    const { id } = req.params;
    const { unit } = req.body;
      await prisma.branchUnit.update({
      where: { id: parseInt(id) },
      data: { unit: unit }
    });
    res.json({ success: true, branchUnitId: id, name: `Branch Unit ${id}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteBranchUnitById = async (req, res) => {
  try {
    const now = new Date();
    const { id } = req.params;
   
      await prisma.branchUnit.update({
      where: { id: parseInt(id) },
      data: { deletedAt: now }
    });
    res.json({ success: true, branchUnitId: id, name: `Branch Unit ${id}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getBranchUnits, branchUnitsGetBranch, addBranchUnit, getBranchUnitById, deleteBranchUnitById };
