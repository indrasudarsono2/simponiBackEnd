import prisma from "../lib/prisma.js";
import config from "../utils/config.json";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import fs from "fs";
import path from "path";

const getIelpUser = async (req, res) => {
  try {
    const ielp = await prisma.ielp.findMany({
      where: {
        deletedAt: null,
        userNik: req.user.nik
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    res.json(ielp);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addIelpUser = async (req, res) => {
  try {
    const {institution, level, released, expired, rater} = req.body
    const files = req.files
    const file = files && files.length > 0 ? files[0] : null
    
    const ielp = await prisma.ielp.create({
      data: {
        userNik: req.user.nik,
        isConfirmed: true,
        institution,
        level,
        released: dayjs.utc(released).toDate(),
        expired: dayjs.utc(`${expired} 23:59:59`).toDate(),
        rater,      
        file: file ? `/uploads/ielp/${file.filename}` : null,
      }
    })
    res.status(200).json({ 
      success: true, 
      ielp,
      files: files ? files.map(f => ({
        filename: f.filename,
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
        url: `/uploads/ielp/${f.filename}`
      })) : null
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getIelpById = async (req, res) => {
  try {
    const { id } = req.params;
    const {institution, level, released, expired, rater} = req.body
    const files = req.files
    const file = files && files.length > 0 ? files[0] : null
   
    const existingIelp = await prisma.ielp.findUnique({
      where: {id: parseInt(id)},
      select: {file: true}
    })

    // Delete old file if a new file is being uploaded and old file exists
    if (file && existingIelp && existingIelp.file) {
      const oldFilePath = path.join(process.cwd(), existingIelp.file);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
    }

    const updateData = {
      userNik: req.user.nik,
      isConfirmed: true,
      institution,
      level,
      released: dayjs.utc(released).toDate(),
      expired: dayjs.utc(`${expired} 23:59:59`).toDate(),
      rater,
    }

    
    if (file) {
      updateData.file = `/uploads/ielp/${file.filename}`;
    }

    await prisma.ielp.update({
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

const deleteIelpById = async (req, res) => {
  try {
    const now = new Date();
    const { id } = req.params;
  
    await prisma.ielp.update({
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

export { getIelpUser, addIelpUser, getIelpById, deleteIelpById};