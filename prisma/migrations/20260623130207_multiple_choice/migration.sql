-- DropForeignKey
ALTER TABLE `multiplechoice` DROP FOREIGN KEY `multiplechoice_parentMultipleChoiceId_fkey`;

-- AddForeignKey
ALTER TABLE `MultipleChoice` ADD CONSTRAINT `MultipleChoice_parentMultipleChoiceId_fkey` FOREIGN KEY (`parentMultipleChoiceId`) REFERENCES `MultipleChoice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
