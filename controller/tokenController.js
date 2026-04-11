import prisma from "../lib/prisma.js";
import config from "../utils/config.json";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import fs from "fs";
import path from "path";

const getTokenData = async (req, res) => {
  // const sect = 1
  const sect = req.user.sectorId
  // const userN = "10011520"
  const userN = req.user.nik
  // const prof = 1
  const prof = req.user.professionId
  // const branchUnitId = 5
  const branchUnitId = req.user.branchUnitId
  try {
    const token = await prisma.token.findFirst({
      where: {
        branchUnitId
      }
    })
    res.json(token);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const postTokenData = async (req, res)=> {
  try {
    const {token, startDate, expiredDate} = req.body
    await prisma.token.create({
      data: {
        branchUnitId: req.user.branchUnitId,
        token: token,
        startDate: dayjs.utc(startDate).toDate(),
        expiredDate: dayjs.utc(expiredDate).toDate()
      }
    })

    res.json({message: "Success"})
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const editTokenData = async (req, res) => {
  try {
    const {id} = req.params
    const {token, startDate, expiredDate} = req.body

    await prisma.token.update({
      where: {
        id: parseInt(id)
      },
      data: {
        branchUnitId: req.user.branchUnitId,
        token: token,
        startDate: dayjs.utc(startDate).toDate(),
        expiredDate: dayjs.utc(expiredDate).toDate()
      }
    })
    res.json({message: "Success"})
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export { getTokenData, postTokenData, editTokenData };