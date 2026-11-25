import { engineApi } from '../bridge/engine-api.js';
import { sanitizeVerseHtml, sanitizeArticleHtml } from './sanitizer.js';

const dictColumnsCache = new Map();

async function getDictColumns(path) {
  if (dictColumnsCache.has(path)) return dictColumnsCache.get(path);
  const res = await engineApi.queryModule(path, 'PRAGMA table_info(dictionary)');
  const cols = (res.rows || []).map((r) => String(r.name || ''));
  const lower = cols.map((c) => c.toLowerCase());

  const keyCol = cols[lower.indexOf('word')] || cols[lower.indexOf('title')] || cols[0] || 'word';
  const valCol = cols[lower.indexOf('data')] || cols[lower.indexOf('definition')] || cols[1] || 'data';

  const info = { keyCol, valCol };
  dictColumnsCache.set(path, info);
  return info;
}

export const myswordAdapter = {
  async getChapter(mod, bookId, chapter) {
    const sql = 'SELECT Verse, Scripture FROM Bible WHERE Book = ? AND Chapter = ? ORDER BY Verse ASC';
    const res = await engineApi.queryModule(mod.path, sql, [String(bookId), String(chapter)]);

    const verses = (res.rows || []).map((row) => {
      const verseNum = Number(row.Verse ?? row.verse ?? 0);
      const raw = row.Scripture ?? row.scripture ?? '';
      return {
        verse: verseNum,
        raw,
        html: sanitizeVerseHtml(raw, 'mysword')
      };
    });

    return { verses, queryMs: res.queryMs || 0 };
  },

  async getCommentaryForChapter(mod, bookId, chapter) {
    const sql = 'SELECT * FROM Commentary WHERE Book = ? AND Chapter = ?';
    const res = await engineApi.queryModule(mod.path, sql, [String(bookId), String(chapter)]);

    const entries = (res.rows || []).map((row) => {
      const fromVerse = Number(row.FromVerse ?? row.Verse ?? row.fromverse ?? 0);
      const toVerse = Number(row.ToVerse ?? fromVerse);
      const raw = row.Data ?? row.data ?? row.Comments ?? '';
      return {
        fromVerse,
        toVerse,
        html: sanitizeArticleHtml(raw, 'mysword')
      };
    }).sort((a, b) => a.fromVerse - b.fromVerse);

    return { entries, queryMs: res.queryMs || 0 };
  },

  async lookupDictionary(mod, query) {
    const clean = String(query || '').trim();
    if (!clean) return { entries: [], queryMs: 0 };

    const { keyCol, valCol } = await getDictColumns(mod.path);
    const sql = `SELECT "${keyCol}" AS k, "${valCol}" AS v FROM dictionary WHERE "${keyCol}" LIKE ? COLLATE NOCASE ORDER BY LENGTH("${keyCol}") ASC LIMIT 20`;
    const res = await engineApi.queryModule(mod.path, sql, [`${clean}%`]);

    let rows = res.rows || [];
    if (rows.length === 0) {
      const fallbackSql = `SELECT "${keyCol}" AS k, "${valCol}" AS v FROM dictionary WHERE "${keyCol}" LIKE ? COLLATE NOCASE LIMIT 15`;
      const fb = await engineApi.queryModule(mod.path, fallbackSql, [`%${clean}%`]);
      rows = fb.rows || [];
    }

    const entries = rows.map((row) => ({
      term: String(row.k ?? ''),
      html: sanitizeArticleHtml(row.v ?? '', 'mysword')
    }));

    return { entries, queryMs: res.queryMs || 0 };
  },

  async getBookTopics(mod, limit = 80, offset = 0) {
    const sql = 'SELECT id, title FROM journal ORDER BY id ASC LIMIT ? OFFSET ?';
    const res = await engineApi.queryModule(mod.path, sql, [String(limit), String(offset)]);
    return {
      topics: (res.rows || []).map((r) => ({ id: r.id, title: String(r.title || `Tópico ${r.id}`) })),
      queryMs: res.queryMs || 0
    };
  },

  async getBookTopicContent(mod, topicId) {
    const sql = 'SELECT id, title, content FROM journal WHERE id = ? LIMIT 1';
    const res = await engineApi.queryModule(mod.path, sql, [String(topicId)]);
    const row = (res.rows || [])[0];
    if (!row) return null;
    return {
      id: row.id,
      title: String(row.title || ''),
      html: sanitizeArticleHtml(row.content || '', 'mysword')
    };
  }
};
