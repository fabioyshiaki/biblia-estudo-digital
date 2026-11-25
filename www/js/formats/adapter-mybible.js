import { engineApi } from '../bridge/engine-api.js';
import { getBookById } from '../core/canon.js';
import { sanitizeVerseHtml, sanitizeArticleHtml } from './sanitizer.js';

export const mybibleAdapter = {
  async getChapter(mod, bookId, chapter) {
    const book = getBookById(bookId);
    if (!book) return { verses: [], queryMs: 0 };

    const sql = 'SELECT verse, text FROM verses WHERE book_number = ? AND chapter = ? ORDER BY verse ASC';
    const res = await engineApi.queryModule(mod.path, sql, [String(book.mybibleNum), String(chapter)]);

    const verses = (res.rows || []).map((row) => {
      const raw = row.text ?? '';
      return {
        verse: Number(row.verse ?? 0),
        raw,
        html: sanitizeVerseHtml(raw, 'mybible')
      };
    });

    return { verses, queryMs: res.queryMs || 0 };
  },

  async getCommentaryForChapter(mod, bookId, chapter) {
    const book = getBookById(bookId);
    if (!book) return { entries: [], queryMs: 0 };

    const sql =
      'SELECT verse_number_from, verse_number_to, text FROM commentaries ' +
      'WHERE book_number = ? AND chapter_number_from = ? ORDER BY verse_number_from ASC';
    const res = await engineApi.queryModule(mod.path, sql, [String(book.mybibleNum), String(chapter)]);

    const entries = (res.rows || []).map((row) => ({
      fromVerse: Number(row.verse_number_from ?? 0),
      toVerse: Number(row.verse_number_to ?? row.verse_number_from ?? 0),
      html: sanitizeArticleHtml(row.text ?? '', 'mybible')
    }));

    return { entries, queryMs: res.queryMs || 0 };
  },

  async lookupDictionary(mod, query) {
    const clean = String(query || '').trim();
    if (!clean) return { entries: [], queryMs: 0 };

    const sql = 'SELECT topic, definition FROM dictionary WHERE topic LIKE ? COLLATE NOCASE ORDER BY LENGTH(topic) ASC LIMIT 20';
    const res = await engineApi.queryModule(mod.path, sql, [`${clean}%`]);

    const entries = (res.rows || []).map((row) => ({
      term: String(row.topic ?? ''),
      html: sanitizeArticleHtml(row.definition ?? '', 'mybible')
    }));

    return { entries, queryMs: res.queryMs || 0 };
  }
};
