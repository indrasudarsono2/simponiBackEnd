-- AlterTable
ALTER TABLE `essay`
  ADD COLUMN `parentEssayId` INTEGER NULL,
  ADD COLUMN `versionGroupId` INTEGER NULL,
  ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true;

-- Backfill version group with current essay id for existing rows
UPDATE `essay`
SET `versionGroupId` = `id`
WHERE `versionGroupId` IS NULL;

-- AddForeignKey
ALTER TABLE `essay`
  ADD CONSTRAINT `essay_parentEssayId_fkey`
  FOREIGN KEY (`parentEssayId`) REFERENCES `essay`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
