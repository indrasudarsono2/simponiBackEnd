import prisma from "../lib/prisma.js";

const apply = process.argv.includes("--apply");

try {
  const count = await prisma.finalScoreCwp.count();
  if (!apply) {
    console.log(JSON.stringify({ mode: "preview", snapshotsToDelete: count }, null, 2));
  } else {
    const result = await prisma.finalScoreCwp.deleteMany();
    console.log(JSON.stringify({ mode: "apply", snapshotsDeleted: result.count }, null, 2));
  }
} finally {
  await prisma.$disconnect();
}
