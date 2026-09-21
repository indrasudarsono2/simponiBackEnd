ALTER TABLE `Cwp` DROP FOREIGN KEY `Cwp_branchUnitId_fkey`;
DROP INDEX `Cwp_branchUnitId_deletedAt_idx` ON `Cwp`;
ALTER TABLE `Cwp` DROP COLUMN `branchUnitId`;
