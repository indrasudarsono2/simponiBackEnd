CREATE TABLE `PassingGradeStandard` (
  `id` INTEGER NOT NULL,
  `theoryGrade` FLOAT NOT NULL DEFAULT 75,
  `practicalGrade` FLOAT NOT NULL DEFAULT 75,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `PassingGradeStandard` (`id`, `theoryGrade`, `practicalGrade`, `createdAt`, `updatedAt`)
VALUES (1, 75, 75, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

ALTER TABLE `Event` ADD COLUMN `practicalPassingGrade` FLOAT NULL;

UPDATE `Event` SET `practicalPassingGrade` = `passingGrade` WHERE `practicalPassingGrade` IS NULL;

UPDATE `Event`
SET `passingGrade` = 75, `practicalPassingGrade` = 75
WHERE `deletedAt` IS NULL AND `startDate` > CURRENT_TIMESTAMP(3);
