import prisma from "../lib/prisma.js";
import config from "../utils/config.json";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import fs from "fs";
import path from "path";

const postPreview = async (req, res) => {
  try {
    const { appRatingId, groupMemberId, eventId } = req.body;
    const files = req.files
    const file = files && files.length > 0 ? files[0] : null

    await prisma.preview.create({
      data: {
        eventId: parseInt(eventId),
        appRatingId: parseInt(appRatingId),
        groupMemberId: parseInt(groupMemberId),
        file: file? `/uploads/preview/${file.filename}` : null,
      }
    })

    res.status(200);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { postPreview };
