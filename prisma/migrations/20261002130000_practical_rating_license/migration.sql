ALTER TABLE `AppRating` ADD COLUMN `practicalLicenseId` INTEGER NULL;
CREATE INDEX `AppRating_practicalLicenseId_idx` ON `AppRating`(`practicalLicenseId`);
ALTER TABLE `AppRating` ADD CONSTRAINT `AppRating_practicalLicenseId_fkey`
  FOREIGN KEY (`practicalLicenseId`) REFERENCES `License`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
