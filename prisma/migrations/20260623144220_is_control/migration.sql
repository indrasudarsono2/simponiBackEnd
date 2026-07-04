/*
  Warnings:

  - You are about to drop the column `shift` on the `shift` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `shift` DROP COLUMN `shift`,
    ADD COLUMN `isControl` BOOLEAN NOT NULL DEFAULT false;
