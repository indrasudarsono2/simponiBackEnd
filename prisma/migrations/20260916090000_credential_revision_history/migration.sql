ALTER TABLE `Ielp`
  ADD COLUMN `rootVersionId` INTEGER NULL,
  ADD COLUMN `previousVersionId` INTEGER NULL,
  ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `isCurrent` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `userConfirmedAt` DATETIME(3) NULL;

ALTER TABLE `Medex`
  ADD COLUMN `rootVersionId` INTEGER NULL,
  ADD COLUMN `previousVersionId` INTEGER NULL,
  ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `isCurrent` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `userConfirmedAt` DATETIME(3) NULL;

UPDATE `Ielp` SET `rootVersionId` = `id`, `version` = 1, `isCurrent` = true,
  `userConfirmedAt` = COALESCE(`verifiedAt`, `createdAt`)
WHERE `rootVersionId` IS NULL;

UPDATE `Medex` SET `rootVersionId` = `id`, `version` = 1, `isCurrent` = true,
  `userConfirmedAt` = COALESCE(`verifiedAt`, `createdAt`)
WHERE `rootVersionId` IS NULL;

CREATE INDEX `Ielp_rootVersionId_version_idx` ON `Ielp`(`rootVersionId`, `version`);
CREATE INDEX `Ielp_userNik_isCurrent_verificationStatus_deletedAt_idx` ON `Ielp`(`userNik`, `isCurrent`, `verificationStatus`, `deletedAt`);
CREATE INDEX `Medex_rootVersionId_version_idx` ON `Medex`(`rootVersionId`, `version`);
CREATE INDEX `Medex_userNik_isCurrent_verificationStatus_deletedAt_idx` ON `Medex`(`userNik`, `isCurrent`, `verificationStatus`, `deletedAt`);

CREATE TABLE `CredentialHistory` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `credentialType` ENUM('IELP', 'MEDEX') NOT NULL,
  `credentialId` INTEGER NOT NULL,
  `rootCredentialId` INTEGER NOT NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `eventType` ENUM('LEGACY_IMPORTED', 'CREATED', 'PERSONALLY_CONFIRMED', 'CHECKER_ASSIGNED', 'SUBMITTED_FOR_VERIFICATION', 'APPROVED', 'REJECTED', 'REVISION_STARTED', 'REVISION_SUBMITTED', 'SUPERSEDED', 'ECHAIN_SYNCED', 'DELETED') NOT NULL,
  `actorNik` VARCHAR(191) NULL,
  `checkerNik` VARCHAR(191) NULL,
  `note` TEXT NULL,
  `file` TEXT NULL,
  `snapshot` LONGTEXT NULL,
  `changes` LONGTEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `CredentialHistory_credentialType_rootCredentialId_createdAt_idx` (`credentialType`, `rootCredentialId`, `createdAt`),
  INDEX `CredentialHistory_credentialType_credentialId_createdAt_idx` (`credentialType`, `credentialId`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `CredentialHistory`
  (`credentialType`, `credentialId`, `rootCredentialId`, `version`, `eventType`, `actorNik`, `checkerNik`, `note`, `file`, `snapshot`, `createdAt`)
SELECT 'IELP', `id`, `id`, 1, 'LEGACY_IMPORTED', `userNik`, `verifiedByNik`,
  'Existing IELP record imported when credential history was introduced.', `file`,
  JSON_OBJECT('institution', `institution`, 'level', `level`, 'released', `released`, 'expired', `expired`, 'rater', `rater`, 'verificationStatus', `verificationStatus`),
  `createdAt`
FROM `Ielp`;

INSERT INTO `CredentialHistory`
  (`credentialType`, `credentialId`, `rootCredentialId`, `version`, `eventType`, `actorNik`, `checkerNik`, `note`, `file`, `snapshot`, `createdAt`)
SELECT 'MEDEX', `id`, `id`, 1, 'LEGACY_IMPORTED', `userNik`, `verifiedByNik`,
  'Existing MEDEX record imported when credential history was introduced.', `file`,
  JSON_OBJECT('institution', `institution`, 'released', `released`, 'expired', `expired`, 'examiner', `examiner`, 'verificationStatus', `verificationStatus`),
  `createdAt`
FROM `Medex`;
