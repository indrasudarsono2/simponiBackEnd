import prisma from "../lib/prisma.js";
import config from "../utils/config.json";

const getSessions = async (req, res) => {
  try {
    const branchUnit = await prisma.branchUnit.findFirst({
      where: {
        id: req.user.branchUnitId
      },
      select: {
        id: true,
        unit: true,
        branch: {
          select: {
            branch: true
          }
        }
      }
    })
    const sessions = await prisma.session.findMany({
      where: {
        branchUnitId: req.user.branchUnitId,
        deletedAt: null
      },
    }); // Example using Prisma ORM
    // Logic to fetch regions (e.g., from a database)
    res.json({branchUnit, sessions});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addSession = async (req, res) => {
  try {
    const { session, branchUnitId } = req.body;
    await prisma.session.create({
      data: {
        session: session,
        branchUnitId: branchUnitId
      }
    })

  res.status(201).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
  
};

const getSesionById = async (req, res) => {
  try {
    const { id } = req.params;
    const { session } = req.body;
      await prisma.session.update({
      where: { id: parseInt(id) },
      data: { session: session }
    });
    res.status(201).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteSessionById = async (req, res) => {
  try {
    const now = new Date();
    const { id } = req.params;
   
      await prisma.session.update({
      where: { id: parseInt(id) },
      data: { deletedAt: now }
    });
    res.status(201).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getSessions, addSession, getSesionById, deleteSessionById };