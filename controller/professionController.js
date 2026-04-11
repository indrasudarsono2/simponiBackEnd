import prisma from "../lib/prisma.js";

const getProfessions = async (req, res) => {
  try {
    const professions = await prisma.profession.findMany({
      where: {
        deletedAt: null
      },
    }); 

    // Logic to fetch regions (e.g., from a database)
    res.json(professions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addProfession = async (req, res) => {
  try {
    const { profession, description } = req.body;
    
    await prisma.profession.create({
      data: {
        profession: profession,
        description: description
      }
    })
      
    res.status(201).json({ success: true, message: `Profession ${profession} added` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getProfessionById = async (req, res) => {
  try {
    const { id } = req.params;
    const { profession, description } = req.body;
      await prisma.profession.update({
      where: { id: parseInt(id) },
      data: { profession: profession, description: description }
    });

    res.json({ success: true, professionId: id, name: `Profession ${id}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteProfessionById = async (req, res) => {
  try {
    const now = new Date();
    const { id } = req.params;
   
      await prisma.profession.update({
      where: { id: parseInt(id) },
      data: { deletedAt: now }
    });

    res.json({ success: true, professionId: id, name: `Profession ${id}` });
  } catch (error) {
    res.status(500).json({ message: error.message });  
  }
};

export { getProfessions, addProfession, getProfessionById, deleteProfessionById };