/*
  Warnings:

  - You are about to drop the column `competenceItemId` on the `competence` table. All the data in the column will be lost.
  - You are about to drop the `competenceitem` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `competence` DROP FOREIGN KEY `Competence_competenceItemId_fkey`;

-- DropIndex
DROP INDEX `Competence_competenceItemId_fkey` ON `competence`;

-- AlterTable
ALTER TABLE `competence` DROP COLUMN `competenceItemId`,
    ADD COLUMN `ratingId` INTEGER NULL;

-- DropTable
DROP TABLE `competenceitem`;

-- AddForeignKey
ALTER TABLE `Competence` ADD CONSTRAINT `Competence_ratingId_fkey` FOREIGN KEY (`ratingId`) REFERENCES `Rating`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
