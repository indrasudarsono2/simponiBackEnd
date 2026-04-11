import prisma from "../lib/prisma.js";

const getRegions = async (req, res) => {
  try {
    const regions = await prisma.region.findMany({
      where: {
        deletedAt: null
      }
    }); // Example using Prisma ORM
    // Logic to fetch regions (e.g., from a database)
    res.json(regions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addRegion = async (req, res) => {
  try {
    const { region } = req.body;
    await prisma.region.create({
      data: {
        region: region
      }
    });
  
    res.status(201).json({ success: true, message: `Region ${region} added` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getRegionById = async (req, res) => {
  try {
    const { id } = req.params;
    const { region } = req.body;
      await prisma.region.update({
      where: { id: parseInt(id) },
      data: { region: region }
    });
    res.json({ success: true, regionId: id, name: `Region ${id}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteRegionById = async (req, res) => {
  try {
    const now = new Date();
    const { id } = req.params;
   
      await prisma.region.update({
      where: { id: parseInt(id) },
      data: { deletedAt: now }
    });
    res.json({ success: true, regionId: id, name: `Region ${id}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getRegions, addRegion, getRegionById, deleteRegionById };
