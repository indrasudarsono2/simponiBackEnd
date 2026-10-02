import prisma from "../lib/prisma.js";
const romanMonths = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

const idOf = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};
const scopedDocument = (nik, id) => ({ id, userNik: nik, deletedAt: null });
const letterInclude = {
  supervisor: { select: { nik: true, name: true } },
  appRating: { select: { id: true, controlHour: true, rating: { select: { rating: true } } } },
  actions: { orderBy: { createdAt: "desc" }, select: { id: true, action: true, actorNik: true, revision: true, reason: true, content: true, createdAt: true } },
};
const ratingInclude = {
  rating: { select: { rating: true } },
  applicationDoc: {
    include: {
      user: { select: { nik: true, name: true, licenseUserId: true, placeOfBirth: true, dateOfBirth: true, branchUnitId: true, personalAddress: true, nationality: true, phoneNumber: true, genderId: true, gender: { select: { gender: true } }, competences: { where: { deletedAt: null }, select: { id: true, institution: true, released: true, rating: { select: { rating: true } } } } } },
      eventUser: { include: { event: { include: { remarkDoc: true, sector: { include: { branchUnit: { include: { branch: true } } } } } } } },
      appRatings: { where: { deletedAt: null }, select: { id: true, controlHour: true, rating: { select: { rating: true } } } },
      ojtUser: { select: { nik: true, name: true, licenseUserId: true, branchUnitId: true } },
      license: { select: { id: true, file: true, note: true } },
      logbook: { select: { id: true, file: true, note: true } },
      medex: { select: { id: true, file: true, released: true, expired: true, institution: true, examiner: true } },
      ielp: { select: { id: true, file: true, released: true, expired: true, level: true, institution: true, rater: true } },
    },
  },
};
const loadRating = (id) => prisma.appRating.findFirst({ where: { id, deletedAt: null, applicationDoc: { deletedAt: null } }, include: ratingInclude });
const branchUnitOf = (rating) => rating?.applicationDoc?.eventUser?.event?.sector?.branchUnitId;
const purposeOf = (rating) => String(rating?.applicationDoc?.eventUser?.event?.remarkDoc?.remark || "").trim().toUpperCase();
const snapshot = (rating, controlHour = rating.controlHour, baseNumber = rating.applicationDoc.letterNumber, issuedAt = rating.applicationDoc.letterDate) => {
  const doc = rating.applicationDoc;
  const event = doc.eventUser?.event;
  const remark = String(event?.remarkDoc?.remark || "").toUpperCase();
  const purpose = remark.includes("PENERBITAN") ? "Penerbitan" : remark.includes("PERPANJANGAN") ? "Perpanjangan" : null;
  if (!purpose) throw new Error("Only PENERBITAN and PERPANJANGAN application documents can create proposal letters.");
  if (!doc.number || !rating.rating?.rating) throw new Error("Application number and proposed rating are required.");
  return {
    number: remark === "PENERBITAN" ? (baseNumber ? `${baseNumber}/${rating.rating.rating}` : `Menunggu persetujuan OJTI/${rating.rating.rating}`) : `${doc.number}/${rating.rating.rating}`,
    classification: rating.rating.rating,
    attachment: "-",
    branchUnit: event.sector?.branchUnit?.unit || "",
    branch: event.sector?.branchUnit?.branch?.branch || "",
    issuedAt: remark === "PENERBITAN" ? (issuedAt || doc.createdAt) : doc.createdAt,
    purpose,
    applicantName: doc.user?.name || "",
    licenseNumber: doc.user?.licenseUserId || "",
    placeOfBirth: doc.user?.placeOfBirth || "",
    dateOfBirth: doc.user?.dateOfBirth,
    nationality: doc.user?.nationality || "",
    gender: doc.user?.gender?.gender || "",
    workPeriod: "",
    ojtiName: doc.ojtUser?.name || "",
    ojtiLicenseNumber: doc.ojtUser?.licenseUserId || "",
    workAddress: doc.address || "",
    controlHour: String(controlHour ?? ""),
    rating: rating.rating.rating,
    applicationDocId: doc.id,
    appRatingId: rating.id,
    supportingFiles: {
      license: doc.license?.file || null,
      logbook: doc.logbook?.file || null,
      medex: doc.medex?.file || null,
      ielp: doc.ielp?.file || null,
    },
  };
};
const sendError = (res, error) => {
  console.error("Proposal letter request failed", error);
  return res.status(500).json({ message: "Unable to process proposal letter." });
};

export const listSupervisors = async (req, res) => {
  try {
    if (!req.user.branchUnitId) return res.status(400).json({ message: "Your branch unit is not configured." });
    const users = await prisma.user.findMany({
      where: { branchUnitId: req.user.branchUnitId, deletedAt: null, nik: { not: req.user.nik }, userRoles: { some: { deletedAt: null, roles: { role: "SUPERVISOR", deletedAt: null } } } },
      select: { nik: true, name: true },
      orderBy: { name: "asc" },
    });
    return res.json(users);
  } catch (error) { return sendError(res, error); }
};

export const listApplicationLetters = async (req, res) => {
  try {
    const applicationDocId = idOf(req.params.applicationDocId);
    if (!applicationDocId) return res.status(400).json({ message: "Invalid application document." });
    const doc = await prisma.applicationDoc.findFirst({ where: scopedDocument(req.user.nik, applicationDocId), select: { id: true, number: true, ojtRecommendationStatus: true, ojtUser: { select: { nik: true, name: true } }, eventUser: { select: { event: { select: { remarkDoc: { select: { remark: true } } } } } }, appRatings: { where: { deletedAt: null }, select: { id: true, controlHour: true, rating: { select: { rating: true } }, proposalLetter: { include: letterInclude } } } } });
    if (!doc) return res.status(404).json({ message: "Application document not found." });
    return res.json(doc);
  } catch (error) { return sendError(res, error); }
};

export const assignSupervisor = async (req, res) => {
  try {
    const applicationDocId = idOf(req.params.applicationDocId);
    const supervisorNik = String(req.body?.supervisorNik || "").trim();
    if (!applicationDocId) return res.status(400).json({ message: "Choose an application." });
    const doc = await prisma.applicationDoc.findFirst({ where: scopedDocument(req.user.nik, applicationDocId), select: { id: true, ojtUser: { select: { nik: true, branchUnitId: true, deletedAt: true, userRoles: { where: { deletedAt: null, roles: { role: "OPERATIONAL", deletedAt: null } }, select: { id: true } } } }, eventUser: { select: { event: { select: { remarkDoc: { select: { remark: true } }, sector: { select: { branchUnitId: true } } } } } }, appRatings: { where: { deletedAt: null }, select: { id: true } } } });
    if (!doc?.appRatings.length) return res.status(404).json({ message: "No proposed ratings were found for this application." });
    const isPenerbitan = doc.eventUser?.event?.remarkDoc?.remark?.trim().toUpperCase() === "PENERBITAN";
    const reviewerNik = isPenerbitan ? doc.ojtUser?.nik : supervisorNik;
    if (!reviewerNik || reviewerNik === req.user.nik || !req.user.branchUnitId || doc.eventUser?.event?.sector?.branchUnitId !== req.user.branchUnitId) return res.status(403).json({ message: "Choose another eligible reviewer in your branch unit." });
    if (isPenerbitan) {
      if (doc.ojtUser?.deletedAt || doc.ojtUser?.branchUnitId !== req.user.branchUnitId || !doc.ojtUser?.userRoles.length) return res.status(403).json({ message: "The selected OJTI is no longer eligible." });
    } else {
      const supervisor = await prisma.user.findFirst({ where: { nik: reviewerNik, branchUnitId: req.user.branchUnitId, deletedAt: null, userRoles: { some: { deletedAt: null, roles: { role: "SUPERVISOR", deletedAt: null } } } }, select: { nik: true } });
      if (!supervisor) return res.status(403).json({ message: "Choose another active supervisor in your branch unit." });
    }
    const ratings = await Promise.all(doc.appRatings.map((item) => loadRating(item.id)));
    if (ratings.some((rating) => branchUnitOf(rating) !== req.user.branchUnitId)) return res.status(403).json({ message: "Application is outside your branch unit." });
    const now = new Date();
    const changed = await prisma.$transaction(async (tx) => {
      let sentOrReassigned = false;
      for (const rating of ratings) {
        const existing = await tx.proposalLetter.findUnique({ where: { appRatingId: rating.id } });
        if (existing?.status === "VALIDATED") {
          if (isPenerbitan && existing.supervisorNik !== reviewerNik) throw new Error("An older validated letter belongs to another reviewer; this application needs an administrative correction before OJTI submission.");
          continue;
        }
        if (existing?.supervisorNik === reviewerNik && existing?.status === "PENDING") continue;
        if (existing) {
          const claim = await tx.proposalLetter.updateMany({ where: { id: existing.id, status: { in: ["PENDING", "RETURNED"] }, supervisorNik: existing.supervisorNik }, data: { supervisorNik: reviewerNik, status: "PENDING", content: snapshot(rating) } });
          if (claim.count !== 1) throw new Error("Letter changed during reassignment. Refresh and retry.");
          sentOrReassigned = true;
          await tx.proposalLetterAction.create({ data: { letterId: existing.id, actorNik: req.user.nik, action: "REASSIGNED", revision: existing.revision, reason: `From ${existing.supervisorNik} to ${reviewerNik}`, content: snapshot(rating) } });
        } else {
          const content = snapshot(rating);
          const letter = await tx.proposalLetter.create({ data: { applicationDocId, appRatingId: rating.id, supervisorNik: reviewerNik, content, status: "PENDING", createdAt: now } });
          sentOrReassigned = true;
          await tx.proposalLetterAction.create({ data: { letterId: letter.id, actorNik: req.user.nik, action: "ASSIGNED", revision: 1, content } });
        }
      }
      if (isPenerbitan && sentOrReassigned) await tx.applicationDoc.update({ where: { id: applicationDocId }, data: { ojtRecommendationStatus: "PENDING", confirmOjt: false } });
      return true;
    });
    return res.json({ success: changed });
  } catch (error) { return sendError(res, error); }
};

export const listInbox = async (req, res) => {
  try {
    const status = req.query.status === "validated" ? "validated" : "not-validated";
    const scope = { supervisorNik: req.user.nik, applicationDoc: { deletedAt: null, eventUser: { event: { remarkDoc: { remark: "PERPANJANGAN" }, sector: { branchUnitId: req.user.branchUnitId } } } } };
    const [letters, validatedCount] = await Promise.all([
      prisma.proposalLetter.findMany({
      where: { ...scope, status: status === "validated" ? "VALIDATED" : { not: "VALIDATED" } },
      select: { id: true, status: true, revision: true, createdAt: true, appRating: { select: { rating: { select: { rating: true } } } }, applicationDoc: { select: { number: true, user: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      }),
      status === "validated" ? Promise.resolve(null) : prisma.proposalLetter.count({ where: { ...scope, status: "VALIDATED" } }),
    ]);
    return res.json({ letters, validatedCount: validatedCount ?? letters.length });
  } catch (error) { return sendError(res, error); }
};

export const getLetter = async (req, res) => {
  try {
    const id = idOf(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid letter." });
    const letter = await prisma.proposalLetter.findUnique({ where: { id }, include: { ...letterInclude, appRating: { include: ratingInclude } } });
    if (!letter || letter.appRating.deletedAt || letter.appRating.applicationDoc.deletedAt) return res.status(404).json({ message: "Letter not found." });
    const doc = letter.appRating.applicationDoc;
    const isPenerbitan = purposeOf(letter.appRating) === "PENERBITAN";
    const isOwner = doc.userNik === req.user.nik;
    const isReviewer = letter.supervisorNik === req.user.nik && branchUnitOf(letter.appRating) === req.user.branchUnitId && (isPenerbitan ? doc.ojtUser?.nik === req.user.nik && doc.ojtLicenseId === req.user.licenseUserId && req.user.roleNames.includes("OPERATIONAL") : req.user.roleNames.includes("SUPERVISOR"));
    if (!isOwner && !isReviewer) return res.status(403).json({ message: "Not allowed to view this letter." });
    return res.json({ ...letter, content: letter.status === "PENDING" ? snapshot(letter.appRating) : letter.content, recipientBranchUnit: doc.eventUser?.event?.sector?.branchUnit?.unit || "", permissions: { canReview: isReviewer && letter.status === "PENDING" && !isOwner, canRevise: isOwner && letter.status === "RETURNED" }, appRating: { id: letter.appRating.id, controlHour: letter.appRating.controlHour, rating: letter.appRating.rating }, documents: {
      applicationDocId: doc.id, applicationNumber: doc.number,
      applicationDoc: doc,
      license: doc.license, logbook: doc.logbook, medex: doc.medex, ielp: doc.ielp,
      briefingFile: doc.eventUser?.event?.briefingFile,
      recommendationFile: doc.eventUser?.event?.recommendationFile,
    } });
  } catch (error) { return sendError(res, error); }
};

export const reviseLetter = async (req, res) => {
  try {
    const id = idOf(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid letter." });
    const letter = await prisma.proposalLetter.findUnique({ where: { id }, include: { appRating: { include: ratingInclude } } });
    if (!letter || letter.appRating.applicationDoc.userNik !== req.user.nik || letter.appRating.applicationDoc.deletedAt) return res.status(404).json({ message: "Letter not found." });
    if (letter.status !== "RETURNED") return res.status(409).json({ message: "Only a returned letter can be corrected and resubmitted." });
    const doc = letter.appRating.applicationDoc;
    if (!doc.license?.file || !doc.logbook?.file || !doc.medex?.file || !doc.ielp?.file) return res.status(409).json({ message: "Upload or select the missing license, logbook, Medex, and IELP documents before resubmitting." });
    const content = snapshot(letter.appRating);
    const nextRevision = letter.revision + 1;
    const changed = await prisma.$transaction(async (tx) => {
      const claim = await tx.proposalLetter.updateMany({ where: { id, status: "RETURNED", revision: letter.revision }, data: { content, revision: nextRevision, status: "PENDING", validatedAt: null } });
      if (claim.count !== 1) return false;
      await tx.proposalLetterAction.create({ data: { letterId: id, actorNik: req.user.nik, action: "RESUBMITTED", revision: nextRevision, reason: "Supporting documents or application details corrected and resubmitted", content } });
      return true;
    });
    if (!changed) return res.status(409).json({ message: "Letter changed. Refresh and retry." });
    return res.json({ success: true, revision: nextRevision });
  } catch (error) { return sendError(res, error); }
};

export const decideLetter = async (req, res) => {
  try {
    const id = idOf(req.params.id);
    const decision = String(req.body?.decision || "").toUpperCase();
    const reason = String(req.body?.reason || "").trim();
    if (!id || !["VALIDATE", "RETURN"].includes(decision)) return res.status(400).json({ message: "Invalid decision." });
    if (decision === "RETURN" && reason.length < 10) return res.status(400).json({ message: "Explain the required correction (at least 10 characters)." });
    const letter = await prisma.proposalLetter.findUnique({ where: { id }, include: { appRating: { include: ratingInclude } } });
    if (!letter || letter.appRating.applicationDoc.deletedAt) return res.status(404).json({ message: "Letter not found." });
    const isPenerbitan = purposeOf(letter.appRating) === "PENERBITAN";
    const doc = letter.appRating.applicationDoc;
    const isReviewer = letter.supervisorNik === req.user.nik && branchUnitOf(letter.appRating) === req.user.branchUnitId && doc.userNik !== req.user.nik && (isPenerbitan ? doc.ojtUser?.nik === req.user.nik && doc.ojtLicenseId === req.user.licenseUserId && req.user.roleNames.includes("OPERATIONAL") : req.user.roleNames.includes("SUPERVISOR"));
    if (!isReviewer) return res.status(403).json({ message: "This letter is not assigned to you." });
    if (letter.status !== "PENDING") return res.status(409).json({ message: "This letter is not pending validation." });
    if (decision === "VALIDATE" && (!doc.license?.file || !doc.logbook?.file || !doc.medex?.file || !doc.ielp?.file)) {
      return res.status(409).json({ message: "Review cannot be completed: license, logbook, Medex, and IELP files are required." });
    }
    const now = new Date();
    const changed = await prisma.$transaction(async (tx) => {
      let baseNumber = doc.letterNumber;
      let issuedAt = doc.letterDate;
      if (isPenerbitan && decision === "VALIDATE") {
        // Serialize approvals of different ratings on the same application.
        await tx.applicationDoc.update({ where: { id: doc.id }, data: { updatedAt: now } });
        const currentDoc = await tx.applicationDoc.findUnique({ where: { id: doc.id }, select: { letterNumber: true, letterDate: true } });
        baseNumber = currentDoc.letterNumber;
        issuedAt = currentDoc.letterDate;
        if (!baseNumber) {
          const branchId = doc.eventUser?.event?.sector?.branchUnit?.branchId;
          const branchName = doc.eventUser?.event?.sector?.branchUnit?.branch?.branch;
          if (!branchId || !branchName) throw new Error("Application branch is missing.");
          const year = now.getUTCFullYear();
          const sequence = await tx.ojtLetterSequence.upsert({ where: { branchId_year: { branchId, year } }, create: { branchId, year, lastNumber: 1 }, update: { lastNumber: { increment: 1 } } });
          baseNumber = `${String(sequence.lastNumber).padStart(3, "0")}/OJTI/${branchName.trim().toUpperCase().replace(/\s+/g, "-")}/${romanMonths[now.getUTCMonth()]}/${year}`;
          issuedAt = now;
          await tx.applicationDoc.update({ where: { id: doc.id }, data: { letterNumber: baseNumber, letterDate: now } });
        }
      }
      const currentContent = snapshot(letter.appRating, letter.appRating.controlHour, baseNumber, issuedAt);
      const claim = await tx.proposalLetter.updateMany({ where: { id, status: "PENDING", supervisorNik: req.user.nik, revision: letter.revision }, data: { status: decision === "VALIDATE" ? "VALIDATED" : "RETURNED", content: currentContent, validatedAt: decision === "VALIDATE" ? now : null } });
      if (claim.count !== 1) throw new Error("Letter changed during validation. Refresh and retry.");
      await tx.proposalLetterAction.create({ data: { letterId: id, actorNik: req.user.nik, action: decision === "VALIDATE" ? "VALIDATED" : "RETURNED", revision: letter.revision, reason: reason || null, content: currentContent } });
      if (isPenerbitan) {
        const incomplete = await tx.proposalLetter.count({ where: { applicationDocId: doc.id, appRating: { deletedAt: null }, status: { not: "VALIDATED" } } });
        await tx.applicationDoc.update({ where: { id: doc.id }, data: { ojtRecommendationStatus: incomplete === 0 ? "ACCEPTED" : "PENDING", confirmOjt: incomplete === 0, ojtAcceptedAt: incomplete === 0 ? now : null, ojtAcceptedByNik: incomplete === 0 ? req.user.nik : null } });
      }
      return true;
    });
    if (!changed) return res.status(409).json({ message: "Letter changed. Refresh and retry." });
    return res.json({ success: true });
  } catch (error) { return sendError(res, error); }
};
