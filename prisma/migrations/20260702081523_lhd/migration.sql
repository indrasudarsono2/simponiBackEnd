/*
  Warnings:

  - You are about to drop the column `others` on the `dutyreport` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `dutyreport` DROP COLUMN `others`;

-- AlterTable
ALTER TABLE `lhdbook` ADD COLUMN `code` VARCHAR(20) NULL;
