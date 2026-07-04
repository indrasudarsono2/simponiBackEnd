-- DropForeignKey
ALTER TABLE `escalation` DROP FOREIGN KEY `Escalation_userNik_fkey`;

-- DropIndex
DROP INDEX `Escalation_userNik_fkey` ON `escalation`;

-- AlterTable
ALTER TABLE `escalation` ADD COLUMN `escalationActorId` INTEGER NULL;

-- CreateTable
CREATE TABLE `EscalationActor` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branchId` INTEGER NULL,
    `actor` VARCHAR(150) NULL,
    `escalationLevelId` INTEGER NULL,
    `remark` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EscalationLevel` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `level` VARCHAR(150) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Escalation` ADD CONSTRAINT `Escalation_escalationActorId_fkey` FOREIGN KEY (`escalationActorId`) REFERENCES `EscalationActor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EscalationActor` ADD CONSTRAINT `EscalationActor_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EscalationActor` ADD CONSTRAINT `EscalationActor_escalationLevelId_fkey` FOREIGN KEY (`escalationLevelId`) REFERENCES `EscalationLevel`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EscalationActor` ADD CONSTRAINT `EscalationActor_actor_fkey` FOREIGN KEY (`actor`) REFERENCES `User`(`nik`) ON DELETE SET NULL ON UPDATE CASCADE;
