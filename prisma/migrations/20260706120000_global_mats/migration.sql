ALTER TABLE `MultipleChoice`
  ADD COLUMN `isMats` BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX `MultipleChoice_isMats_isActive_deletedAt_idx`
  ON `MultipleChoice`(`isMats`, `isActive`, `deletedAt`);

CREATE TABLE `MatsConfiguration` (
  `id` INTEGER NOT NULL DEFAULT 1,
  `quantity` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `MatsConfiguration` (`id`, `quantity`, `updatedAt`)
VALUES (1, 0, CURRENT_TIMESTAMP(3));

CREATE TABLE `MatsQuestionSelection` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `appRatingId` INTEGER NOT NULL,
  `eventId` INTEGER NOT NULL,
  `multipleChoiceId` INTEGER NOT NULL,
  `slot` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `MatsQuestionSelection_appRatingId_eventId_multipleChoiceId_key`(`appRatingId`, `eventId`, `multipleChoiceId`),
  UNIQUE INDEX `MatsQuestionSelection_appRatingId_eventId_slot_key`(`appRatingId`, `eventId`, `slot`),
  INDEX `MatsQuestionSelection_appRatingId_eventId_idx`(`appRatingId`, `eventId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MatsQuestionSelection`
  ADD CONSTRAINT `MatsQuestionSelection_appRatingId_fkey` FOREIGN KEY (`appRatingId`) REFERENCES `AppRating`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `MatsQuestionSelection_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `MatsQuestionSelection_multipleChoiceId_fkey` FOREIGN KEY (`multipleChoiceId`) REFERENCES `MultipleChoice`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
