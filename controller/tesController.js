import prisma from "../lib/prisma.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import fs from "fs";
import path from "path";

dayjs.extend(utc);

const tesstatus = async (req, res) => {
  try {
    const dutyReport = await prisma.dutyReport.findMany({
      
    })

    res.json(dutyReport)
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { tesstatus };
