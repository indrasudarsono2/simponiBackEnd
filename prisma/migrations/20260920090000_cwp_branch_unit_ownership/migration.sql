ALTER TABLE `Cwp`
  ADD COLUMN `branchUnitId` INTEGER NULL;

UPDATE `Cwp` AS `c`
LEFT JOIN (
  SELECT `sc`.`cwpId`, MIN(`s`.`branchUnitId`) AS `branchUnitId`
  FROM `SectorCwp` AS `sc`
  INNER JOIN `Sector` AS `s` ON `s`.`id` = `sc`.`sectorId`
  WHERE `sc`.`deletedAt` IS NULL
    AND `s`.`deletedAt` IS NULL
  GROUP BY `sc`.`cwpId`
) AS `owner` ON `owner`.`cwpId` = `c`.`id`
SET `c`.`branchUnitId` = `owner`.`branchUnitId`;

CREATE INDEX `Cwp_branchUnitId_deletedAt_idx`
  ON `Cwp`(`branchUnitId`, `deletedAt`);

ALTER TABLE `Cwp`
  ADD CONSTRAINT `Cwp_branchUnitId_fkey`
  FOREIGN KEY (`branchUnitId`) REFERENCES `BranchUnit`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
