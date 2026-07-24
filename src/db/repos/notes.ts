import type { Note, NoteLink } from '@/core/model/types';
import { getDb } from '../index';

interface NoteRow {
  id: string;
  body: string;
  date: string | null;
  created_at: string;
  updated_at: string;
}

interface NoteLinkRow {
  id: string;
  note_id: string;
  target_type: 'event' | 'reminder';
  target_id: string;
  source_line: number | null;
  created_at: string;
}

function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    body: row.body,
    date: row.date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toLink(row: NoteLinkRow): NoteLink {
  return {
    id: row.id,
    noteId: row.note_id,
    targetType: row.target_type,
    targetId: row.target_id,
    sourceLine: row.source_line ?? undefined,
    createdAt: row.created_at,
  };
}

export function listNotes(): Note[] {
  return getDb()
    .getAllSync<NoteRow>('SELECT * FROM notes ORDER BY updated_at DESC')
    .map(toNote);
}

export function upsertNote(note: Note): void {
  getDb().runSync(
    'INSERT OR REPLACE INTO notes (id, body, date, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [note.id, note.body, note.date, note.createdAt, note.updatedAt],
  );
}

/** Deletes the note; its links go with it via FK cascade. */
export function deleteNote(id: string): void {
  getDb().runSync('DELETE FROM notes WHERE id = ?', [id]);
}

export function listNoteLinks(): NoteLink[] {
  return getDb()
    .getAllSync<NoteLinkRow>('SELECT * FROM note_links ORDER BY created_at')
    .map(toLink);
}

export function addNoteLink(link: NoteLink): void {
  getDb().runSync(
    `INSERT OR REPLACE INTO note_links (
      id, note_id, target_type, target_id, source_line, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [link.id, link.noteId, link.targetType, link.targetId, link.sourceLine ?? null, link.createdAt],
  );
}

export function deleteNoteLink(id: string): void {
  getDb().runSync('DELETE FROM note_links WHERE id = ?', [id]);
}
