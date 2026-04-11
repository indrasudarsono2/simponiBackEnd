-- DropForeignKey
ALTER TABLE `practicaltest` DROP FOREIGN KEY `PracticalTest_appRatingId_fkey`;

-- DropIndex
DROP INDEX `PracticalTest_appRatingId_fkey` ON `practicaltest`;

-- AddForeignKey
ALTER TABLE `PracticalTest` ADD CONSTRAINT `PracticalTest_appRatingId_fkey` FOREIGN KEY (`appRatingId`) REFERENCES `AppRating`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
