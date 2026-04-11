/*
  Warnings:

  - You are about to drop the column `brifingFile` on the `event` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `event` DROP COLUMN `brifingFile`,
    ADD COLUMN `briefingFile` TEXT NULL;
