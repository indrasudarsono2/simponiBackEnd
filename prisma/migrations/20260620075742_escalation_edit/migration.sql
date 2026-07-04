/*
  Warnings:

  - You are about to drop the column `escalationActorId` on the `escalation` table. All the data in the column will be lost.
  - You are about to drop the column `userNik` on the `escalation` table. All the data in the column will be lost.
  - You are about to drop the column `escalationId` on the `message` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `escalation` DROP FOREIGN KEY `Escalation_escalationActorId_fkey`;

-- DropForeignKey
ALTER TABLE `message` DROP FOREIGN KEY `Message_escalationId_fkey`;

-- DropIndex
DROP INDEX `Escalation_escalationActorId_fkey` ON `escalation`;

-- DropIndex
DROP INDEX `Message_escalationId_fkey` ON `message`;

-- AlterTable
ALTER TABLE `escalation` DROP COLUMN `escalationActorId`,
    DROP COLUMN `userNik`,
    ADD COLUMN `branchId` INTEGER NULL,
    ADD COLUMN `escalationLevelId` INTEGER NULL,
    ADD COLUMN `messageId` INTEGER NULL;

-- AlterTable
ALTER TABLE `escalationlevel` ADD COLUMN `branchId` INTEGER NULL;

-- AlterTable
ALTER TABLE `message` DROP COLUMN `escalationId`;

-- AddForeignKey
ALTER TABLE `Escalation` ADD CONSTRAINT `Escalation_escalationLevelId_fkey` FOREIGN KEY (`escalationLevelId`) REFERENCES `EscalationLevel`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Escalation` ADD CONSTRAINT `Escalation_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `Message`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Escalation` ADD CONSTRAINT `Escalation_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EscalationLevel` ADD CONSTRAINT `EscalationLevel_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
