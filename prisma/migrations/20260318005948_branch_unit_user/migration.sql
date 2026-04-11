-- AlterTable
ALTER TABLE `user` ADD COLUMN `branchUnitId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_branchUnitId_fkey` FOREIGN KEY (`branchUnitId`) REFERENCES `BranchUnit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
