export async function mapEchainProfile(row, nik, genders) {
  if (!row || String(row.persnum).trim() !== nik) throw new Error('ECHAIN identity mismatch');
  const data = {};
  for (const [source, target, max] of [['nama','name',150],['tempat_lahir','placeOfBirth',100],['no_hp','phoneNumber',50],['email_kantor','email',150]]) {
    const value = typeof row[source] === 'string' ? row[source].trim() : '';
    if (value && value.length <= max && (target !== 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) data[target] = value;
  }
  if (typeof row.tgl_lahir === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.tgl_lahir)) {
    const date = new Date(row.tgl_lahir + 'T00:00:00Z');
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === row.tgl_lahir && date <= new Date()) data.dateOfBirth = row.tgl_lahir;
  }
  if (typeof row.jabatan === 'string' && row.jabatan.trim() && typeof row.lokasi_kedudukan === 'string' && row.lokasi_kedudukan.trim()) {
    const address = `${row.jabatan.trim()} in ${row.lokasi_kedudukan.trim()}`;
    if (address.length <= 255) data.personalAddress = address;
  }
  const gender = {L:'LAKI-LAKI',P:'PEREMPUAN'}[row.kelamin?.trim().toUpperCase()];
  const matches = gender ? genders.filter(g => g.gender?.trim().toUpperCase() === gender) : [];
  if (matches.length === 1) { data.genderId = String(matches[0].id); data.genderLabel = gender; }
  return data;
}
