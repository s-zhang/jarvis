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
    );

    CREATE TABLE IF NOT EXISTS events (
      event_id TEXT PRIMARY KEY,
      source TEXT,
      type TEXT,
      data TEXT,
      timestamp INTEGER
    );

    CREATE TABLE IF NOT EXISTS conversation_items (
      id TEXT PRIMARY KEY,
      previousId TEXT NULL,
      type TEXT, -- message OR function_call OR function_call_output
      data TEXT,
      timestamp INTEGER,
      FOREIGN KEY (previousId) REFERENCES conversation_items(id)
    );
  `);

  return db;
}

export default initializeDatabase; 