import prisma from "../lib/prisma.js";

const getRatings = async (req, res) => {
  try {
    const ratings = await prisma.rating.findMany({
      where: {
        deletedAt: null
      },
      include: {
        profession: true
      }
    }); 
    // Logic to fetch regions (e.g., from a database)
    res.json(ratings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addRating = async (req, res) => {
  try {
    const { rating, professionId, description } = req.body;
    await prisma.rating.create({
      data: {
        rating: rating,
        description: description,
        professionId: professionId
      }
    })
  
    res.status(201).json({ success: true, message: `Rating ${rating} added` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getRatingById = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, professionId, description } = req.body;
      await prisma.rating.update({
      where: { id: parseInt(id) },
      data: { rating: rating, professionId: professionId, description: description }
    });
    res.json({ success: true, ratingId: id, name: `Rating ${id}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteRatingById = async (req, res) => {
  try {
    const now = new Date();
    const { id } = req.params;
   
      await prisma.rating.update({
      where: { id: parseInt(id) },
      data: { deletedAt: now }
    });
    res.json({ success: true, ratingId: id, name: `Rating ${id}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getRatings, addRating, getRatingById, deleteRatingById };