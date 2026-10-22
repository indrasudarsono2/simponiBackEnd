-- Align the singleton configuration ID default with the Prisma schema.
-- Metadata only: existing IDs, grades and other stored values are unchanged.
ALTER TABLE `PassingGradeStandard` ALTER COLUMN `id` SET DEFAULT 1;
