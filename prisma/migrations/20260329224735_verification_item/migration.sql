-- CreateTable
CREATE TABLE `VerificationItems` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `item` VARCHAR(220) NULL,
    `isPenerbitan` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
