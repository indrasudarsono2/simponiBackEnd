import prisma from "../lib/prisma.js";
import config from "../utils/config.json";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import fs from "fs";
import path from "path";

const getCompetenceUser = async (req, res) => {
  try {
    const competence = await prisma.competence.findMany({
      where: {
        deletedAt: null,
        userId: req.user.nik
      },
      include: {
        rating: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    const rating = await prisma.rating.findMany({
      where: {
        deletedAt: null
      }
    })

    res.json({competence, rating});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addCompetenceUser = async (req, res) => {
  try {
    const {ratingId, institution, released} = req.body
    const files = req.files
    const file = files && files.length > 0 ? files[0] : null
    
    const competence = await prisma.competence.create({
      data: {
        userId: req.user.nik,
        ratingId: parseInt(ratingId),
        institution,
        released: dayjs.utc(released).toDate(),
        file: file ? `/uploads/competence/${file.filename}` : null,
      }
    })
    res.status(200).json({ 
      success: true, 
      competence,
      files: files ? files.map(f => ({
        filename: f.filename,
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
        url: `/uploads/competence/${f.filename}`
      })) : null
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getCompetenceById = async (req, res) => {
  try {
    const { id } = req.params;
    const {ratingId, institution, released} = req.body
    const files = req.files
    const file = files && files.length > 0 ? files[0] : null
   
    const existingCompetence = await prisma.competence.findUnique({
      where: {id: parseInt(id)},
      select: {file: true}
    })

    // Delete old file if a new file is being uploaded and old file exists
    if (file && existingCompetence && existingCompetence.file) {
      const oldFilePath = path.join(process.cwd(), existingCompetence.file);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
    }

    const updateData = {
      userId: req.user.nik,
      ratingId: parseInt(ratingId),
      institution,
      released: dayjs.utc(released).toDate(),
    }

    if (file) {
      updateData.file = `/uploads/competence/${file.filename}`;
    }

    await prisma.competence.update({
      where: {
        id: parseInt(id)
      },
      data: updateData
    })

    res.status(201).json({ success: true,}); 
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteCompetenceById = async (req, res) => {
  try {
    const now = new Date();
    const { id } = req.params;
  
    await prisma.competence.update({
      where: { id: parseInt(id) },
        data: { 
          deletedAt: now,
        }
      });
    res.status(201).json({ success: true,});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
  
};

export { getCompetenceUser, addCompetenceUser, getCompetenceById, deleteCompetenceById};