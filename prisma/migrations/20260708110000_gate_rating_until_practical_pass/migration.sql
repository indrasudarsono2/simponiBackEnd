INSERT INTO `status` (`status`, `createdAt`, `updatedAt`)
SELECT 'WAITING PRACTICAL', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (
  SELECT 1 FROM `status` WHERE `status` = 'WAITING PRACTICAL' AND `deletedAt` IS NULL
);

UPDATE `userRating` AS `ur`
INNER JOIN `FinalScore` AS `fs`
  ON `fs`.`id` = `ur`.`finalScoreId`
INNER JOIN `Event` AS `e`
  ON `e`.`id` = `fs`.`eventId`
SET `ur`.`deletedAt` = CURRENT_TIMESTAMP(3)
WHERE `ur`.`deletedAt` IS NULL
  AND (`e`.`isPractical` = true OR `e`.`isSimulator` = true)
  AND (
    NOT EXISTS (
      SELECT 1
      FROM `PracticalTest` AS `pt`
      WHERE `pt`.`appRatingId` = `fs`.`appRatingId`
        AND `pt`.`deletedAt` IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM `PracticalTest` AS `pt`
      WHERE `pt`.`appRatingId` = `fs`.`appRatingId`
        AND `pt`.`deletedAt` IS NULL
        AND (`pt`.`score` IS NULL OR `pt`.`score` < `e`.`passingGrade`)
    )
  );
