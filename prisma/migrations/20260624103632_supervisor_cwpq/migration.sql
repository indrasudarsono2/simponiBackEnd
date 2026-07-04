-- AlterTable
ALTER TABLE `supervisor` ADD COLUMN `branchUnitId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `Supervisor` ADD CONSTRAINT `Supervisor_branchUnitId_fkey` FOREIGN KEY (`branchUnitId`) REFERENCES `BranchUnit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
