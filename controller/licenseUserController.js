import prisma from "../lib/prisma.js";
import config from "../utils/config.json";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import fs from "fs";
import path from "path";

const getLicenseUser = async (req, res) => {
  try {
    const license = await prisma.license.findMany({
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

const addLicenseUser = async (req, res) => {
  try {
    const {note, licenseExpiredDate} = req.body
    const files = req.files
    const file = files && files.length > 0 ? files[0] : null
    
    const license = await prisma.license.create({
      data: {
        userNik: req.user.nik,
        note,
        expiredDate: dayjs.utc(licenseExpiredDate).add(1, 'day').subtract(1, 'second').toDate(),
        file: file ? `/uploads/license/${file.filename}` : null,
      }
    })
    res.status(200).json({ 
      success: true, 
      license,
      files: files ? files.map(f => ({
        filename: f.filename,
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
        url: `/uploads/license/${f.filename}`
      })) : null
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getLicenseById = async (req, res) => {
  try {
    const { id } = req.params;
    const {note, licenseExpiredDate} = req.body
    const files = req.files
    const file = files && files.length > 0 ? files[0] : null
   
    const existingLicense = await prisma.license.findUnique({
      where: {id: parseInt(id)},
      select: {file: true}
    })

    // Delete old file if a new file is being uploaded and old file exists
    if (file && existingLicense && existingLicense.file) {
      const oldFilePath = path.join(process.cwd(), existingLicense.file);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
    }
    const updateData = {
      userNik: req.user.nik,
      note: note,
      expiredDate: dayjs.utc(licenseExpiredDate).add(1, 'day').subtract(1, 'second').toDate(),
    }

    if (file) {
      updateData.file = `/uploads/license/${file.filename}`;
    }

    await prisma.license.update({
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

const deleteLicenseById = async (req, res) => {
  try {
    const now = new Date();
    const { id } = req.params;
  
    await prisma.license.update({
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

export { getLicenseUser, addLicenseUser, getLicenseById, deleteLicenseById};