/*
  Warnings:

  - You are about to drop the column `verified` on the `applicationdoc` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[applicationDocId]` on the table `Verification` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `applicationdoc` DROP COLUMN `verified`;

-- CreateIndex
CREATE UNIQUE INDEX `Verification_applicationDocId_key` ON `Verification`(`applicationDocId`);
