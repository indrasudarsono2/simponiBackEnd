-- CreateTable
CREATE TABLE `Competence` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(150) NULL,
    `competenceItemId` INTEGER NULL,
    `institution` VARCHAR(200) NULL,
    `released` DATETIME(3) NULL,
    `file` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CompetenceItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `item` VARCHAR(220) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Competence` ADD CONSTRAINT `Competence_competenceItemId_fkey` FOREIGN KEY (`competenceItemId`) REFERENCES `CompetenceItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Competence` ADD CONSTRAINT `Competence_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`nik`) ON DELETE SET NULL ON UPDATE CASCADE;
