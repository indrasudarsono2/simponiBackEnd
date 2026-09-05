ALTER TABLE `User`
  ADD COLUMN `authenticationType` ENUM('AIRNAV_SSO', 'LOCAL') NULL;

-- Preserve existing accounts as unclassified during the transition so neither
-- login path is unexpectedly removed. Newly created users default to LOCAL.
ALTER TABLE `User`
  MODIFY COLUMN `authenticationType` ENUM('AIRNAV_SSO', 'LOCAL') NULL DEFAULT 'LOCAL';
