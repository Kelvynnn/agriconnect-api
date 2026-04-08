import fs from 'fs';
import path from 'path';
import pool from './pool';

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('✅ Database migration successful');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
