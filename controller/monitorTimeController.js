import prisma from "../lib/prisma.js";
import config from "../utils/config.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import fs from "fs";
import path from "path";

const postTime = async (req, res) => {
  try {
    const {appRatingId, eventQuestionId} = req.body
    const monitor = await prisma.monitorTime.findFirst({
      where: {
        appRatingId,
        eventQuestionId
      },
      select: {
        id: true,
        time: true
      }
    })

    if(monitor){
      await prisma.monitorTime.update({
        where: {
          id: monitor.id
        },
        data: {
          time: monitor.time + 5
        }
      })
    }else{
      await prisma.monitorTime.create({
        data: {
          appRatingId,
          eventQuestionId,
          time: 5
        }
      })
    }

    res.status(200);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
export { postTime };
