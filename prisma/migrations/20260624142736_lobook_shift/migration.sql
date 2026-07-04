-- AlterTable
ALTER TABLE `logbook` ADD COLUMN `shiftId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `LogBook` ADD CONSTRAINT `LogBook_shiftId_fkey` FOREIGN KEY (`shiftId`) REFERENCES `Shift`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
