CREATE TABLE `ExamAccessExtension` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `appRatingId` INTEGER NOT NULL,
  `accessUntil` DATETIME(3) NOT NULL,
  `actorNik` VARCHAR(150) NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `ExamAccessExtension_appRatingId_id_idx` (`appRatingId`, `id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ExamAccessExtension_appRatingId_fkey` FOREIGN KEY (`appRatingId`) REFERENCES `AppRating` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
