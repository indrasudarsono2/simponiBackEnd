import mysql from 'mysql2/promise';
import 'dotenv/config';

const conn = await mysql.createConnection({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: '',
  database: 'simponi',
});

// Get all tables
const [tables] = await conn.query('SHOW TABLES');
const tableNames = tables.map(t => Object.values(t)[0]);

console.log(`Found ${tableNames.length} tables. Fixing zero dates...\n`);

for (const table of tableNames) {
  try {
    // Check if table has updatedAt column
    const [cols] = await conn.query(`SHOW COLUMNS FROM \`${table}\` LIKE 'updatedAt'`);
    if (cols.length > 0) {
      const [result] = await conn.query(
        `UPDATE \`${table}\` SET updatedAt = createdAt WHERE updatedAt = '0000-00-00 00:00:00'`
      );
      if (result.affectedRows > 0) {
        console.log(`✅ Fixed ${result.affectedRows} row(s) in table: ${table}`);
      }
    }
  } catch (e) {
    console.log(`⚠️  Skipped ${table}: ${e.message}`);
  }
}

await conn.end();
console.log('\n✅ Done! All zero dates have been fixed.');
