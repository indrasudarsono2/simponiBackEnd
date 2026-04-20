-- AlterTable
ALTER TABLE `questiongroup` ADD COLUMN `mandatoryId` INTEGER NULL;

-- CreateTable
CREATE TABLE `Mandatory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mandatory` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `QuestionGroup` ADD CONSTRAINT `QuestionGroup_mandatoryId_fkey` FOREIGN KEY (`mandatoryId`) REFERENCES `Mandatory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
