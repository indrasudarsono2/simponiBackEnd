/*
  Warnings:

  - You are about to drop the column `branchUnitId` on the `shift` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `shift` DROP FOREIGN KEY `Shift_branchUnitId_fkey`;

-- DropIndex
DROP INDEX `Shift_branchUnitId_fkey` ON `shift`;

-- AlterTable
ALTER TABLE `shift` DROP COLUMN `branchUnitId`,
    ADD COLUMN `shiftNameId` INTEGER NULL;

-- CreateTable
CREATE TABLE `ShiftName` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branchUnitId` INTEGER NULL,
    `shift` VARCHAR(150) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ShiftName` ADD CONSTRAINT `ShiftName_branchUnitId_fkey` FOREIGN KEY (`branchUnitId`) REFERENCES `BranchUnit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Shift` ADD CONSTRAINT `Shift_shiftNameId_fkey` FOREIGN KEY (`shiftNameId`) REFERENCES `ShiftName`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
