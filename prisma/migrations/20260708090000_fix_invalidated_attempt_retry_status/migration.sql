UPDATE `AppRating` AS `ar`
INNER JOIN `ExaminationInvalidation` AS `ei`
  ON `ei`.`appRatingId` = `ar`.`id`
INNER JOIN `FinalScore` AS `fs`
  ON `fs`.`id` = `ei`.`finalScoreId`
SET `ar`.`statusId` = CASE
  WHEN EXISTS (
    SELECT 1
    FROM `EventQuestion` AS `eq`
    WHERE `eq`.`eventId` = `fs`.`eventId`
      AND `eq`.`kindOfQuestionId` = 1
      AND `eq`.`deletedAt` IS NULL
  ) THEN 1
  ELSE 4
END
WHERE `ar`.`statusId` = 2;
