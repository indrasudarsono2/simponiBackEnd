/*
  Warnings:

  - You are about to drop the column `shiftId` on the `dutyreport` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `dutyreport` DROP FOREIGN KEY `DutyReport_shiftId_fkey`;

-- DropIndex
DROP INDEX `DutyReport_shiftId_fkey` ON `dutyreport`;

-- AlterTable
ALTER TABLE `dutyreport` DROP COLUMN `shiftId`,
    ADD COLUMN `shiftNameId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `DutyReport` ADD CONSTRAINT `DutyReport_shiftNameId_fkey` FOREIGN KEY (`shiftNameId`) REFERENCES `ShiftName`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
