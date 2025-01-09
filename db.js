import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function initializeDatabase(isProd) {
  const db = await open({
    filename: isProd ? './db/prod.db' : './db/dev.db',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS secrets (
      key TEXT,
      value TEXT,
      creationDate INTEGER,
      expirationDate INTEGER,
      PRIMARY KEY (key, creationDate)
    )
  `);

  return db;
}

export default initializeDatabase; 