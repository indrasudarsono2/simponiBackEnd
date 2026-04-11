import prisma from "../lib/prisma.js";

const getProfessions = async (req, res) => {
  try {
    const professionInBranch = await prisma.professionInBranch.findMany({
      where: {
        deletedAt: null,
        branchId: req.user.branchId
      },
      select: {
        id: true,
        profession: {
          select: {
            id: true,
            profession: true
          }
          
        }
      }
    })

    const profession = await prisma.profession.findMany({
      where: {
        deletedAt: null
      }
    })

    // Logic to fetch regions (e.g., from a database)
    res.json({professionInBranch, profession});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addProfession = async (req, res) => {
  try {
    const { professionId } = req.body;

    const find = await prisma.professionInBranch.findFirst({
      where: {
        deletedAt: null,
        branchId: req.user.branchId,
        professionId: parseInt(professionId)
      },
      select: {
        profession: {
          select: {
            profession: true
          }
        }
      }
    })
   
    if (find){
      return res.status(501).json({success: false, message: `${find.profession.profession} already exist`})
    }

    await prisma.professionInBranch.create({
      data: {
        branchId: req.user.branchId,
        professionId: parseInt(professionId)
      }
    })
      
    res.status(201).json({ success: true});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getProfessionById = async (req, res) => {
  try {
    const { id } = req.params;
    const { professionId } = req.body;
      await prisma.professionInBranch.update({
      where: { id: parseInt(id) },
      data: { professionId: parseInt(professionId) }
    });

    res.json({ success: true});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteProfessionById = async (req, res) => {
  try {
    const now = new Date();
    const { id } = req.params;
   
      await prisma.professionInBranch.update({
      where: { id: parseInt(id) },
      data: { deletedAt: now }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });  
  }
};

export { getProfessions, getProfessionById, addProfession, deleteProfessionById };