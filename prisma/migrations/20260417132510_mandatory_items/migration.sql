/*
  Warnings:

  - You are about to drop the column `mandatoryId` on the `questiongroup` table. All the data in the column will be lost.
  - You are about to drop the `mandatory` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `questiongroup` DROP FOREIGN KEY `QuestionGroup_mandatoryId_fkey`;

-- DropIndex
DROP INDEX `QuestionGroup_mandatoryId_fkey` ON `questiongroup`;

-- AlterTable
ALTER TABLE `questiongroup` DROP COLUMN `mandatoryId`,
    ADD COLUMN `mandatoryRatingId` INTEGER NULL;

-- DropTable
DROP TABLE `mandatory`;

-- CreateTable
CREATE TABLE `MandatoryRating` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ratingId` INTEGER NULL,
    `mandatoryItemId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MandatoryItems` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mandatory` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `QuestionGroup` ADD CONSTRAINT `QuestionGroup_mandatoryRatingId_fkey` FOREIGN KEY (`mandatoryRatingId`) REFERENCES `MandatoryRating`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MandatoryRating` ADD CONSTRAINT `MandatoryRating_mandatoryItemId_fkey` FOREIGN KEY (`mandatoryItemId`) REFERENCES `MandatoryItems`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MandatoryRating` ADD CONSTRAINT `MandatoryRating_ratingId_fkey` FOREIGN KEY (`ratingId`) REFERENCES `Rating`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
