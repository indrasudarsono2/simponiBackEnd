-- AlterTable
ALTER TABLE `finalscore` ADD COLUMN `statusId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `FinalScore` ADD CONSTRAINT `FinalScore_statusId_fkey` FOREIGN KEY (`statusId`) REFERENCES `status`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
