import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputPath = path.join(__dirname, 'try.json');
const outputPath = path.join(__dirname, 'try1.generated.json');

function toTemplateStructure(source) {
  const questionGroups = Array.isArray(source.questionGroup) ? source.questionGroup : [];
  const mcqGroups = Array.isArray(source.multipleChoiceQuestionGroup)
    ? source.multipleChoiceQuestionGroup
    : [];

  // Count selected questions per sector + questionGroup.
  const selectedCount = new Map();
  for (const item of mcqGroups) {
    const sectorId = item?.sector?.id;
    const questionGroupId = item?.questionGroup?.id;

    if (sectorId == null || questionGroupId == null) continue;

    const key = `${sectorId}|${questionGroupId}`;
    selectedCount.set(key, (selectedCount.get(key) || 0) + 1);
  }

  // Group question groups by sector + rating.
  const sectorRatingMap = new Map();

  for (const qg of questionGroups) {
    const sectorId = qg?.subBranchUnitRating?.sector?.id;
    const sectorName = qg?.subBranchUnitRating?.sector?.sector;
    const rating = qg?.subBranchUnitRating?.rating?.rating;

    if (sectorId == null || !sectorName || !rating) continue;

    const srKey = `${sectorId}|${rating}`;
    if (!sectorRatingMap.has(srKey)) {
      sectorRatingMap.set(srKey, {
        sectorId,
        sector: sectorName,
        rating,
        questionGroup: [],
      });
    }

    const selected = selectedCount.get(`${sectorId}|${qg.id}`) || 0;

    sectorRatingMap.get(srKey).questionGroup.push({
      group: qg.group,
      quantity: qg.quantity,
      selected,
    });
  }

  // Keep output stable.
  const result = [...sectorRatingMap.values()]
    .map((item) => ({
      sector: item.sector,
      rating: item.rating,
      questionGroup: item.questionGroup.sort((a, b) => a.group.localeCompare(b.group)),
    }))
    .sort((a, b) => {
      if (a.sector !== b.sector) return a.sector.localeCompare(b.sector);
      return a.rating.localeCompare(b.rating);
    });

  return result;
}

function main() {
  const raw = fs.readFileSync(inputPath, 'utf8');
  const source = JSON.parse(raw);

  const transformed = toTemplateStructure(source);

  fs.writeFileSync(outputPath, JSON.stringify(transformed, null, 2));
  console.log(`Generated: ${outputPath}`);
  console.log(JSON.stringify(transformed, null, 2));
}

main();