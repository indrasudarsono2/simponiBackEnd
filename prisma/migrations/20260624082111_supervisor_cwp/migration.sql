/*
  Warnings:

  - You are about to drop the column `sectorId` on the `dutyreport` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `dutyreport` DROP FOREIGN KEY `DutyReport_sectorId_fkey`;

-- DropIndex
DROP INDEX `DutyReport_sectorId_fkey` ON `dutyreport`;

-- AlterTable
ALTER TABLE `dutyreport` DROP COLUMN `sectorId`,
    ADD COLUMN `supervisorId` INTEGER NULL;

-- CreateTable
CREATE TABLE `Supervisor` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `supervisor` VARCHAR(150) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CwpSupervisor` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cwpId` INTEGER NULL,
    `supervisorId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DutyReport` ADD CONSTRAINT `DutyReport_supervisorId_fkey` FOREIGN KEY (`supervisorId`) REFERENCES `Supervisor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CwpSupervisor` ADD CONSTRAINT `CwpSupervisor_cwpId_fkey` FOREIGN KEY (`cwpId`) REFERENCES `Cwp`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CwpSupervisor` ADD CONSTRAINT `CwpSupervisor_supervisorId_fkey` FOREIGN KEY (`supervisorId`) REFERENCES `Supervisor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
