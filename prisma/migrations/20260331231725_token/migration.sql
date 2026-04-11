-- CreateTable
CREATE TABLE `token` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branchUnitId` INTEGER NULL,
    `token` BOOLEAN NOT NULL DEFAULT false,
    `startDate` DATETIME(3) NULL,
    `expiredDate` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `token_branchUnitId_key`(`branchUnitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `token` ADD CONSTRAINT `token_branchUnitId_fkey` FOREIGN KEY (`branchUnitId`) REFERENCES `BranchUnit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
