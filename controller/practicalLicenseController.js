import prisma from '../lib/prisma.js';
import { groupPolicyInclude, policyError } from '../services/groupRatingPolicy.js';

export async function putRatingLicense(req, res) {
  try {
    const id = Number(req.params.id);
    const files = Array.isArray(req.files) ? req.files : [];
    const file = files[0];
    if (!Number.isSafeInteger(id) || id < 1 || files.length !== 1 || file?.fieldname !== 'licenseFile' || file.mimetype !== 'application/pdf' || !/\.pdf$/i.test(file.originalname)) throw policyError('Provide one PDF license.');
    const test = await prisma.practicalTest.findFirst({ where: { id, deletedAt: null }, include: {
      groupMember: { include: { group: { include: groupPolicyInclude } } },
      appRating: { include: { applicationDoc: true } },
    } });
    const group = test?.groupMember?.group;
    if (!group || group.deletedAt || test.groupMember.deletedAt || group.pic !== req.user.nik ||
        !req.user.branchUnitId || Number(group.event?.session?.branchUnitId) !== Number(req.user.branchUnitId) ||
        test.groupMember.member !== test.appRating?.applicationDoc?.userNik) throw policyError('Only this participant’s assigned PIC may upload the license.', 403);
    if (!group.event?.forExpiredDate) throw policyError('Set the event expiration date first.', 409);
    await prisma.$transaction(async tx => {
      await tx.$queryRawUnsafe('SELECT id FROM `AppRating` WHERE id = ? FOR UPDATE', test.appRatingId);
      const license = await tx.license.create({ data: { userNik: test.groupMember.member,
        note: group.event.event, expiredDate: group.event.forExpiredDate, file: `/uploads/license/${file.filename}` } });
      const current = await tx.appRating.findUnique({ where: { id: test.appRatingId }, select: { practicalLicenseId: true } });
      await tx.appRating.update({ where: { id: test.appRatingId }, data: { practicalLicenseId: license.id } });
      await tx.groupAssignmentAudit.create({ data: { groupId: group.id, actorNik: req.user.nik, action: 'LICENSE_UPLOADED', snapshot: { appRatingId: test.appRatingId, previousLicenseId: current.practicalLicenseId, licenseId: license.id } } });
    });
    res.json({ success: true });
  } catch (error) { res.status(error.status || 500).json({ message: error.message }); }
}
