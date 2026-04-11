import prisma from "../lib/prisma.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import fs from "fs";
import path from "path";

const getMedexUser = async (req, res) => {
  try {
    const license = await prisma.medex.findMany({
      where: {
        deletedAt: null,
        userNik: req.user.nik
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    res.json(license);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addMedexUser = async (req, res) => {
  try {
    const {institution, released, expired, examiner} = req.body
    const files = req.files
    const file = files && files.length > 0 ? files[0] : null
    
    const medex = await prisma.medex.create({
      data: {
        userNik: req.user.nik,
        isConfirmed: true,
        institution,
        released: dayjs.utc(released).toDate(),
        expired: dayjs.utc(`${expired} 23:59:59`).toDate(),
        examiner,      
        file: file ? `/uploads/medex/${file.filename}` : null,
      }
    })
    res.status(200).json({ 
      success: true, 
      medex,
      files: files ? files.map(f => ({
        filename: f.filename,
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
        url: `/uploads/medex/${f.filename}`
      })) : null
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMedexById = async (req, res) => {
  try {
    const { id } = req.params;

    const {institution, released, expired, examiner} = req.body
    const files = req.files
    const file = files && files.length > 0 ? files[0] : null
   
    const existingMedex = await prisma.medex.findUnique({
      where: {id: parseInt(id)},
      select: {file: true}
    })

    // Delete old file if a new file is being uploaded and old file exists
    if (file && existingMedex && existingMedex.file) {
      const oldFilePath = path.join(process.cwd(), existingMedex.file);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
    }
   
    const updateData = {
      userNik: req.user.nik,
      isConfirmed: true,
      institution,
      examiner,
      released: dayjs.utc(released).toDate(),
      expired: dayjs.utc(`${expired} 23:59:59`).toDate(),
    }
    
    if (file) {
      updateData.file = `/uploads/medex/${file.filename}`;
    }

    await prisma.medex.update({
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

const deleteMedexById = async (req, res) => {
  try {
    const now = new Date();
    const { id } = req.params;
  
    await prisma.medex.update({
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

export { getMedexUser, addMedexUser, getMedexById, deleteMedexById };