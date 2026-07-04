-- AlterTable
ALTER TABLE `multiplechoice`
  ADD COLUMN `parentMultipleChoiceId` INTEGER NULL,
  ADD COLUMN `versionGroupId` INTEGER NULL,
  ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true;

-- Backfill version group with current multiple choice id for existing rows
UPDATE `multiplechoice`
SET `versionGroupId` = `id`
WHERE `versionGroupId` IS NULL;

-- AddForeignKey
ALTER TABLE `multiplechoice`
  ADD CONSTRAINT `multiplechoice_parentMultipleChoiceId_fkey`
  FOREIGN KEY (`parentMultipleChoiceId`) REFERENCES `multiplechoice`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
