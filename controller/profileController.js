import prisma from "../lib/prisma.js";
import config from "../utils/config.json";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import fs from "fs";
import path from "path";
dayjs.extend(utc)

const getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findFirst({
      where: {
        deletedAt: null,
        // nik: "10011520",
        nik: req.user.nik
      },
      select: {
        nik: true,
        licenseUserId: true,
        professionInBranch: {
          select: {
            id: true,
            profession: true
          }
        },
        sector: {
          select: {
            id: true,
            sector: true
          }
        },
        branch: {
          select: {
            id: true,
            branch: true
          }
        },
        branchUnit: {
          select: {
            id: true,
            unit: true
          }
        },
        name: true,
        dateOfBirth: true,
        placeOfBirth: true,
        personalAddress: true,
        nationality: true,
        phoneNumber: true,
        gender: {
          select: {
            id: true,
            gender: true
          }
        },
        email: true
      }
    })

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const editProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const {name, licenseUserId, genderId, dateOfBirth, placeOfBirth, personalAddress, nationality, phoneNumber, email } = req.body
    
    await prisma.user.update({
      where: {
        nik: id
      },
      data: {
        name,
        licenseUserId,
        genderId: parseInt(genderId),
        dateOfBirth: dayjs.utc(dateOfBirth).toDate(),
        placeOfBirth,
        personalAddress,
        nationality,
        phoneNumber,
        email
      }
    })
    res.status(201).json({ success: true,}); 
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getProfile, editProfile };