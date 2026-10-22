export const SELF_DECLARATION = 'Manually entered — self-declared. The applicant confirms the information and supporting document are accurate and accepts responsibility. This is not checker, AirNav, or e-Chain verification.';

export function assertManualDeclaration(body, file) {
  if (body?.selfDeclared !== true && body?.selfDeclared !== 'true') {
    throw Object.assign(new Error('Confirm that the manually entered information and supporting document are accurate.'), { status: 400 });
  }
  if (!file) throw Object.assign(new Error('A supporting document is required for manual IELP/MEDEX entry.'), { status: 400 });
}

export async function credentialIsLinked(db, type, id) {
  if (!['medex', 'ielp'].includes(type)) throw new Error('Unsupported credential type');
  // Include archived/deleted applications: their supporting evidence must remain consistent.
  return Boolean(await db.applicationDoc.findFirst({ where: { [type + 'Id']: id }, select: { id: true } }));
}

export async function assertCredentialUnlinked(db, type, id) {
  if (await credentialIsLinked(db, type, id)) {
    throw Object.assign(new Error('This record is used by an application document and cannot be edited or deleted. Add or synchronize a new record instead.'), { status: 409 });
  }
}
