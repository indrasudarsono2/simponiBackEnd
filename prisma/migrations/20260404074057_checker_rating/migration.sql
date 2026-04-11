-- CreateTable
CREATE TABLE `CheckerRating` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userRoleId` INTEGER NULL,
    `ratingId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CheckerRating` ADD CONSTRAINT `CheckerRating_userRoleId_fkey` FOREIGN KEY (`userRoleId`) REFERENCES `UserRoles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CheckerRating` ADD CONSTRAINT `CheckerRating_ratingId_fkey` FOREIGN KEY (`ratingId`) REFERENCES `Rating`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
