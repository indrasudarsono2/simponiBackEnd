-- DropForeignKey
ALTER TABLE `logbook` DROP FOREIGN KEY `logBook_cwpId_fkey`;

-- DropForeignKey
ALTER TABLE `logbook` DROP FOREIGN KEY `logBook_dutyReportId_fkey`;

-- DropForeignKey
ALTER TABLE `logbook` DROP FOREIGN KEY `logBook_supervisor_fkey`;

-- DropForeignKey
ALTER TABLE `logbook` DROP FOREIGN KEY `logBook_userNik_fkey`;

-- AddForeignKey
ALTER TABLE `LogBook` ADD CONSTRAINT `LogBook_userNik_fkey` FOREIGN KEY (`userNik`) REFERENCES `User`(`nik`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LogBook` ADD CONSTRAINT `LogBook_cwpId_fkey` FOREIGN KEY (`cwpId`) REFERENCES `Cwp`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LogBook` ADD CONSTRAINT `LogBook_dutyReportId_fkey` FOREIGN KEY (`dutyReportId`) REFERENCES `DutyReport`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LogBook` ADD CONSTRAINT `LogBook_supervisor_fkey` FOREIGN KEY (`supervisor`) REFERENCES `User`(`nik`) ON DELETE SET NULL ON UPDATE CASCADE;
