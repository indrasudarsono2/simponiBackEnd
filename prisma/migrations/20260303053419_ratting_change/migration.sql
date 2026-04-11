/*
  Warnings:

  - You are about to drop the column `rattingId` on the `subbranchunitrating` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `subbranchunitrating` DROP FOREIGN KEY `SubBranchUnitRating_rattingId_fkey`;

-- DropIndex
DROP INDEX `SubBranchUnitRating_rattingId_fkey` ON `subbranchunitrating`;

-- AlterTable
ALTER TABLE `subbranchunitrating` DROP COLUMN `rattingId`,
    ADD COLUMN `ratingId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `SubBranchUnitRating` ADD CONSTRAINT `SubBranchUnitRating_ratingId_fkey` FOREIGN KEY (`ratingId`) REFERENCES `Rating`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
