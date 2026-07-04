-- AlterTable
ALTER TABLE `briefing` ADD COLUMN `branchId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `Briefing` ADD CONSTRAINT `Briefing_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
