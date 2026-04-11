-- DropForeignKey
ALTER TABLE `rating` DROP FOREIGN KEY `Rating_professionInBranchId_fkey`;

-- DropIndex
DROP INDEX `Rating_professionInBranchId_fkey` ON `rating`;

-- AlterTable
ALTER TABLE `rating` ADD COLUMN `professionId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `Rating` ADD CONSTRAINT `Rating_professionId_fkey` FOREIGN KEY (`professionId`) REFERENCES `Profession`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
