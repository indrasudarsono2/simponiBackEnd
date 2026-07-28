CREATE TABLE `MedicalCheckRevision` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `medicalCheckId` INTEGER NOT NULL,
  `editedBy` VARCHAR(150) NOT NULL,
  `reason` TEXT NOT NULL,
  `previousBloodPressure` VARCHAR(50) NULL,
  `newBloodPressure` VARCHAR(50) NULL,
  `previousIsFit` BOOLEAN NULL,
  `newIsFit` BOOLEAN NULL,
  `previousUnNormalCondition` TEXT NULL,
  `newUnNormalCondition` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `MedicalCheckRevision_medicalCheckId_createdAt_idx`(`medicalCheckId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MedicalCheckRevision`
  ADD CONSTRAINT `MedicalCheckRevision_medicalCheckId_fkey`
  FOREIGN KEY (`medicalCheckId`) REFERENCES `MedicalCheck`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
