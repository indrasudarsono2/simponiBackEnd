/*
  Warnings:

  - You are about to drop the column `appRatingId` on the `room` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `room` DROP FOREIGN KEY `Room_appRatingId_fkey`;

-- DropIndex
DROP INDEX `Room_appRatingId_fkey` ON `room`;

-- AlterTable
ALTER TABLE `room` DROP COLUMN `appRatingId`,
    ADD COLUMN `eventUserId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `Room` ADD CONSTRAINT `Room_eventUserId_fkey` FOREIGN KEY (`eventUserId`) REFERENCES `EventUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
