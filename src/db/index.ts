// Local persistence. Opens imera.db lazily, applies migrations from ./schema,
// and hands the connection to the repositories in ./repos. The UI never
// touches SQL — it goes through the zustand store, which calls repositories.

import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import { MIGRATIONS } from './schema';

let db: SQLiteDatabase | null = null;

export function getDb(): SQLiteDatabase {
  if (!db) {
    db = openDatabaseSync('imera.db');
    db.execSync('PRAGMA journal_mode = WAL');
    db.execSync('PRAGMA foreign_keys = ON');
    migrate(db);
  }
  return db;
}

function migrate(db: SQLiteDatabase): void {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.withTransactionSync(() => {
      db!.execSync(MIGRATIONS[v]);
      db!.execSync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}
