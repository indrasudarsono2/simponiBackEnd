export async function requireApplicationLogbook(client, id, userNik) {
  const parsed = Number(id);
  const fail = () => Object.assign(new Error('The selected logbook has no uploaded file or is unavailable. Upload a logbook file and select your own active logbook before submitting.'), { status: 422 });
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw fail();
  const record = await client.logBookUser.findFirst({
    where: { id: parsed, userNik, deletedAt: null }, select: { id: true, file: true },
  });
  if (!record || typeof record.file !== 'string' || !record.file.trim()) throw fail();
  return record;
}
