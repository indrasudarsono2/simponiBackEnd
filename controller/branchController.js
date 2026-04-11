import prisma from "../lib/prisma.js";

const getBranches = async (req, res) => {
  try {
    const branches = await prisma.branch.findMany({
      where: {
        deletedAt: null
      },
      include: {
        region: true
      }
    }); // Example using Prisma ORM
    // Logic to fetch regions (e.g., from a database)
    res.json(branches);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addBranch = async (req, res) => {
  try {
    const { branch, regionId } = req.body;
    await prisma.branch.create({
      data: {
        branch: branch,
        regionId: regionId
      }
    })
    res.status(201).json({ success: true, message: `Branch ${branch} added` }); 
  } catch (error) {
     res.status(500).json({ message: error.message });
  }
};

const getBranchById = async (req, res) => {
  try {
    const { id } = req.params;
    const { branch, regionId } = req.body;
      await prisma.branch.update({
      where: { id: parseInt(id) },
      data: { branch: branch, regionId: regionId }
    });
    res.json({ success: true, regionId: id, name: `Region ${id}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteBranchById = async (req, res) => {
  try {
    const now = new Date();
    const { id } = req.params;
  
      await prisma.branch.update({
      where: { id: parseInt(id) },
      data: { deletedAt: now }
    });
    res.json({ success: true, regionId: id, name: `Region ${id}` });
  } catch (error) {
     res.status(500).json({ message: error.message });
  }
};

export { getBranches, addBranch, getBranchById, deleteBranchById};