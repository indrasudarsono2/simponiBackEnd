ALTER TABLE `Ielp` DROP FOREIGN KEY `Ielp_verifiedByNik_fkey`, DROP FOREIGN KEY `Ielp_requestedCheckerNik_fkey`;
ALTER TABLE `Medex` DROP FOREIGN KEY `Medex_verifiedByNik_fkey`, DROP FOREIGN KEY `Medex_requestedCheckerNik_fkey`;
DROP INDEX `Ielp_userNik_verificationStatus_expired_idx` ON `Ielp`;
DROP INDEX `Ielp_requestedCheckerNik_verificationStatus_deletedAt_idx` ON `Ielp`;
DROP INDEX `Medex_userNik_verificationStatus_expired_idx` ON `Medex`;
DROP INDEX `Medex_requestedCheckerNik_verificationStatus_deletedAt_idx` ON `Medex`;
ALTER TABLE `Ielp` DROP COLUMN `verificationNote`, DROP COLUMN `verifiedAt`, DROP COLUMN `verifiedByNik`, DROP COLUMN `requestedCheckerNik`, DROP COLUMN `verificationStatus`, DROP COLUMN `source`;
ALTER TABLE `Medex` DROP COLUMN `verificationNote`, DROP COLUMN `verifiedAt`, DROP COLUMN `verifiedByNik`, DROP COLUMN `requestedCheckerNik`, DROP COLUMN `verificationStatus`, DROP COLUMN `source`;
