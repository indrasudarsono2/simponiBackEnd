-- AlterTable
ALTER TABLE `event` ADD COLUMN `isPractical` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `isSimulator` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `practicaltest` ADD COLUMN `kindOfPracticalId` INTEGER NULL;

-- CreateTable
CREATE TABLE `KindOfPractical` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kind` VARCHAR(100) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PracticalTest` ADD CONSTRAINT `PracticalTest_kindOfPracticalId_fkey` FOREIGN KEY (`kindOfPracticalId`) REFERENCES `KindOfPractical`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
