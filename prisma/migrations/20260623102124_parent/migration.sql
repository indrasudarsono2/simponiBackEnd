-- DropForeignKey
ALTER TABLE `essay` DROP FOREIGN KEY `essay_parentEssayId_fkey`;

-- AddForeignKey
ALTER TABLE `Essay` ADD CONSTRAINT `Essay_parentEssayId_fkey` FOREIGN KEY (`parentEssayId`) REFERENCES `Essay`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
