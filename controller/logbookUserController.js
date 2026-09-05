import prisma from "../lib/prisma.js";
import config from "../utils/config.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import fs from "fs";
import path from "path";

const getLogbookUser = async (req, res) => {
  try {
    const whereClause = {
      deletedAt: null,
      userNik: req.user.nik,
    };

    const logbook = await prisma.logBookUser.findMany({
      where: whereClause,
      orderBy: {
        createdAt: 'desc'
      }
    })

    res.json(logbook);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addLogbookUser = async (req, res) => {
  try {
    const {note} = req.body
    const files = req.files
    const file = files && files.length > 0 ? files[0] : null
    
    const logbookUser = await prisma.logBookUser.create({
      data: {
        userNik: req.user.nik,
        note,
        file: file ? `/uploads/logbookUser/${file.filename}` : null,
      }
    })
    res.status(200).json({ 
      success: true, 
      logbookUser,
      files: files ? files.map(f => ({
        filename: f.filename,
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
        url: `/uploads/logbookUser/${f.filename}`
      })) : null
    });
  } catch (error) {
    console.log('oke');
    res.status(500).json({ message: error.message });
  }
};

const getLogbookById = async (req, res) => {
  try {
    const { id } = req.params;
    const {note} = req.body
    const files = req.files
    const file = files && files.length > 0 ? files[0] : null
   
    const existingLogbookUser = await prisma.logBookUser.findUnique({
      where: {id: parseInt(id)},
      select: {file: true}
    })

    // Delete old file if a new file is being uploaded and old file exists
    if (file && existingLogbookUser && existingLogbookUser.file) {
      const oldFilePath = path.join(process.cwd(), existingLogbookUser.file);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
    }
    const updateData = {
      userNik: req.user.nik,
      note: note,
    }

    if (file) {
      updateData.file = `/uploads/logbookUser/${file.filename}`;
    }

    await prisma.logBookUser.update({
      where: {
        id: parseInt(id)
      },
      data: updateData
    });

    res.status(201).json({ success: true,}); 
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteLogbookById = async (req, res) => {
  try {
    const now = new Date();
    const { id } = req.params;
  
    await prisma.logBookUser.update({
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

export { getLogbookUser, addLogbookUser, getLogbookById, deleteLogbookById };
