import { engineApi } from '../bridge/engine-api.js';
import { sanitizeVerseHtml, sanitizeArticleHtml } from './sanitizer.js';
import { isRtfContent, rtfToHtml } from './rtf-cleaner.js';

function cleanEswordContent(raw, isVerse = false) {
  const html = isRtfContent(raw) ? rtfToHtml(raw) : String(raw || '');
  return isVerse ? sanitizeVerseHtml(html, 'mysword') : sanitizeArticleHtml(html, 'mysword');
}

export const eswordAdapter = {
  async getChapter(mod, bookId, chapter) {
    const sql = 'SELECT Verse, Scripture FROM Bible WHERE Book = ? AND Chapter = ? ORDER BY Verse ASC';
    const res = await engineApi.queryModule(mod.path, sql, [String(bookId), String(chapter)]);

    const verses = (res.rows || []).map((row) => {
      const raw = row.Scripture ?? row.scripture ?? '';
      return {
        verse: Number(row.Verse ?? row.verse ?? 0),
        raw,
        html: cleanEswordContent(raw, true)
      };
    });

    return { verses, queryMs: res.queryMs || 0 };
  },

  async getCommentaryForChapter(mod, bookId, chapter) {
    const tables = `,${String(mod.tablesCsv || '').toLowerCase()},`;
    let entries = [];
    let queryMs = 0;

    if (tables.includes(',verses,')) {
      const sql = 'SELECT VerseBegin, VerseEnd, Comments FROM Verses WHERE Book = ? AND Chapter = ? ORDER BY VerseBegin ASC';
      const res = await engineApi.queryModule(mod.path, sql, [String(bookId), String(chapter)]);
      queryMs += res.queryMs || 0;
      entries = (res.rows || []).map((row) => ({
        fromVerse: Number(row.VerseBegin ?? 0),
        toVerse: Number(row.VerseEnd ?? row.VerseBegin ?? 0),
        html: cleanEswordContent(row.Comments ?? '', false)
      }));
    } else if (tables.includes(',chapters,')) {
      const sql = 'SELECT Comments FROM Chapters WHERE Book = ? AND Chapter = ? LIMIT 1';
      const res = await engineApi.queryModule(mod.path, sql, [String(bookId), String(chapter)]);
      queryMs += res.queryMs || 0;
      entries = (res.rows || []).map((row) => ({
        fromVerse: 0,
        toVerse: 0,
        html: cleanEswordContent(row.Comments ?? '', false)
      }));
    }

    return { entries, queryMs };
  },

  async lookupDictionary(mod, query) {
    const clean = String(query || '').trim();
    if (!clean) return { entries: [], queryMs: 0 };

    const sql = 'SELECT Topic, Definition FROM Dictionary WHERE Topic LIKE ? COLLATE NOCASE ORDER BY LENGTH(Topic) ASC LIMIT 20';
    const res = await engineApi.queryModule(mod.path, sql, [`${clean}%`]);

    const entries = (res.rows || []).map((row) => ({
      term: String(row.Topic ?? ''),
      html: cleanEswordContent(row.Definition ?? '', false)
    }));

    return { entries, queryMs: res.queryMs || 0 };
  },

  async getBookTopics(mod, limit = 80, offset = 0) {
    const tables = `,${String(mod.tablesCsv || '').toLowerCase()},`;
    const table = tables.includes(',topics,') ? 'Topics' : 'Journal';
    const sql = `SELECT rowid AS id, Title FROM ${table} ORDER BY rowid ASC LIMIT ? OFFSET ?`;
    const res = await engineApi.queryModule(mod.path, sql, [String(limit), String(offset)]);

    return {
      topics: (res.rows || []).map((r) => ({ id: r.id, title: String(r.Title || `Tópico ${r.id}`) })),
      queryMs: res.queryMs || 0
    };
  },

  async getBookTopicContent(mod, topicId) {
    const tables = `,${String(mod.tablesCsv || '').toLowerCase()},`;
    const table = tables.includes(',topics,') ? 'Topics' : 'Journal';
    const col = tables.includes(',topics,') ? 'Comments' : 'Note';
    const sql = `SELECT rowid AS id, Title, ${col} AS body FROM ${table} WHERE rowid = ? LIMIT 1`;
    const res = await engineApi.queryModule(mod.path, sql, [String(topicId)]);
    const row = (res.rows || [])[0];
    if (!row) return null;

    return {
      id: row.id,
      title: String(row.Title || ''),
      html: cleanEswordContent(row.body || '', false)
    };
  }
};
