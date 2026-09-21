-- Run only after deploying application code that no longer reads revision/history fields.
-- This removes audit history permanently; take a database backup first.
DROP TABLE IF EXISTS `CredentialHistory`;

DROP INDEX `Ielp_rootVersionId_version_idx` ON `Ielp`;
DROP INDEX `Ielp_userNik_isCurrent_verificationStatus_deletedAt_idx` ON `Ielp`;
ALTER TABLE `Ielp`
  DROP COLUMN `rootVersionId`,
  DROP COLUMN `previousVersionId`,
  DROP COLUMN `version`,
  DROP COLUMN `isCurrent`,
  DROP COLUMN `userConfirmedAt`;

DROP INDEX `Medex_rootVersionId_version_idx` ON `Medex`;
DROP INDEX `Medex_userNik_isCurrent_verificationStatus_deletedAt_idx` ON `Medex`;
ALTER TABLE `Medex`
  DROP COLUMN `rootVersionId`,
  DROP COLUMN `previousVersionId`,
  DROP COLUMN `version`,
  DROP COLUMN `isCurrent`,
  DROP COLUMN `userConfirmedAt`;
