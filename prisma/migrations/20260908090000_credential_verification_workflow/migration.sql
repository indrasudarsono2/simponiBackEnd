ALTER TABLE `Medex`
  ADD COLUMN `source` ENUM('ECHAIN', 'MANUAL', 'LEGACY') NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN `verificationStatus` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN `requestedCheckerNik` VARCHAR(191) NULL,
  ADD COLUMN `verifiedByNik` VARCHAR(191) NULL,
  ADD COLUMN `verifiedAt` DATETIME(3) NULL,
  ADD COLUMN `verificationNote` TEXT NULL;

ALTER TABLE `Ielp`
  ADD COLUMN `source` ENUM('ECHAIN', 'MANUAL', 'LEGACY') NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN `verificationStatus` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN `requestedCheckerNik` VARCHAR(191) NULL,
  ADD COLUMN `verifiedByNik` VARCHAR(191) NULL,
  ADD COLUMN `verifiedAt` DATETIME(3) NULL,
  ADD COLUMN `verificationNote` TEXT NULL;

CREATE INDEX `Medex_requestedCheckerNik_verificationStatus_deletedAt_idx`
  ON `Medex`(`requestedCheckerNik`, `verificationStatus`, `deletedAt`);
CREATE INDEX `Medex_userNik_verificationStatus_expired_idx`
  ON `Medex`(`userNik`, `verificationStatus`, `expired`);
CREATE INDEX `Ielp_requestedCheckerNik_verificationStatus_deletedAt_idx`
  ON `Ielp`(`requestedCheckerNik`, `verificationStatus`, `deletedAt`);
CREATE INDEX `Ielp_userNik_verificationStatus_expired_idx`
  ON `Ielp`(`userNik`, `verificationStatus`, `expired`);

ALTER TABLE `Medex`
  ADD CONSTRAINT `Medex_requestedCheckerNik_fkey` FOREIGN KEY (`requestedCheckerNik`) REFERENCES `User`(`nik`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `Medex_verifiedByNik_fkey` FOREIGN KEY (`verifiedByNik`) REFERENCES `User`(`nik`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Ielp`
  ADD CONSTRAINT `Ielp_requestedCheckerNik_fkey` FOREIGN KEY (`requestedCheckerNik`) REFERENCES `User`(`nik`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `Ielp_verifiedByNik_fkey` FOREIGN KEY (`verifiedByNik`) REFERENCES `User`(`nik`) ON DELETE SET NULL ON UPDATE CASCADE;
