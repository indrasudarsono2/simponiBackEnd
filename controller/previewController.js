import prisma from "../lib/prisma.js";
import fs from "fs";

function parsePositiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function removeUploadedFiles(files) {
  files.forEach((file) => {
    try {
      fs.unlinkSync(file.path);
    } catch (_cleanupError) {
      return;
    }
  });
}

const postPreview = async (req, res) => {
  const files = Array.isArray(req.files) ? req.files : [];

  try {
    const { appRatingId, groupMemberId, eventId } = req.body;
    const parsedEventId = parsePositiveInteger(eventId);
    const parsedAppRatingId = parsePositiveInteger(appRatingId);
    const parsedGroupMemberId = parsePositiveInteger(groupMemberId);
    const allowedFieldNames = new Set(["file", "cameraFile", "screenFile"]);

    if (!parsedEventId || !parsedAppRatingId || !parsedGroupMemberId) {
      removeUploadedFiles(files);
      return res.status(400).json({ message: "Invalid preview metadata." });
    }
    if (!files.length) {
      return res.status(400).json({ message: "At least one preview file is required." });
    }
    if (files.some((file) => !allowedFieldNames.has(file.fieldname))) {
      removeUploadedFiles(files);
      return res.status(400).json({ message: "Invalid preview file field." });
    }

    await prisma.$transaction(
      files.map((file) =>
        prisma.preview.create({
          data: {
            eventId: parsedEventId,
            appRatingId: parsedAppRatingId,
            groupMemberId: parsedGroupMemberId,
            file: `/uploads/preview/${file.filename}`,
          },
        }),
      ),
    );

    return res.status(200).json({ message: "success", files: files.length });
  } catch (error) {
    removeUploadedFiles(files);
    return res.status(500).json({ message: error.message });
  }
};

export { postPreview };
