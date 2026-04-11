-- AlterTable
ALTER TABLE `practicaltest` ADD COLUMN `checkerGroupId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `PracticalTest` ADD CONSTRAINT `PracticalTest_checkerGroupId_fkey` FOREIGN KEY (`checkerGroupId`) REFERENCES `CheckerGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
