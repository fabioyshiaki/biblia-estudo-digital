import { engineApi } from '../bridge/engine-api.js';
import { sanitizeArticleHtml } from './sanitizer.js';
import { isRtfContent, rtfToHtml } from './rtf-cleaner.js';

function cleanTwmData(raw) {
  const str = String(raw || '');
  if (str.startsWith('[BLOB ')) {
    return '<p class="muted-text">Conteúdo compactado/binário neste módulo theWord (suporte a BLOB comprimido entra na próxima revisão).</p>';
  }
  const html = isRtfContent(str) ? rtfToHtml(str) : str;
  return sanitizeArticleHtml(html, 'mysword');
}

export const thewordTwmAdapter = {
  async getChapter() {
    return { verses: [], queryMs: 0 };
  },

  async getCommentaryForChapter(mod, bookId, chapter) {
    const sql =
      'SELECT br.fvi, br.tvi, c.data ' +
      'FROM bible_refs br ' +
      'JOIN content c ON c.topic_id = br.topic_id ' +
      'WHERE br.bi = ? AND br.ci = ? ' +
      'ORDER BY br.fvi ASC';

    const res = await engineApi.queryModule(mod.path, sql, [String(bookId), String(chapter)]);
    const entries = (res.rows || []).map((row) => ({
      fromVerse: Number(row.fvi ?? 0),
      toVerse: Number(row.tvi ?? row.fvi ?? 0),
      html: cleanTwmData(row.data ?? '')
    }));

    return { entries, queryMs: res.queryMs || 0 };
  },

  async lookupDictionary(mod, query) {
    const clean = String(query || '').trim();
    if (!clean) return { entries: [], queryMs: 0 };

    const sql =
      'SELECT t.subject, c.data ' +
      'FROM topics t ' +
      'JOIN content c ON c.topic_id = t.id ' +
      'WHERE t.subject LIKE ? COLLATE NOCASE ' +
      'ORDER BY LENGTH(t.subject) ASC LIMIT 20';

    const res = await engineApi.queryModule(mod.path, sql, [`${clean}%`]);
    const entries = (res.rows || []).map((row) => ({
      term: String(row.subject ?? ''),
      html: cleanTwmData(row.data ?? '')
    }));

    return { entries, queryMs: res.queryMs || 0 };
  },

  async getBookTopics(mod, limit = 80, offset = 0) {
    const sql = 'SELECT id, subject FROM topics ORDER BY rel_order ASC, id ASC LIMIT ? OFFSET ?';
    const res = await engineApi.queryModule(mod.path, sql, [String(limit), String(offset)]);

    return {
      topics: (res.rows || []).map((r) => ({ id: r.id, title: String(r.subject || `Tópico ${r.id}`) })),
      queryMs: res.queryMs || 0
    };
  },

  async getBookTopicContent(mod, topicId) {
    const sql =
      'SELECT t.id, t.subject, c.data ' +
      'FROM topics t ' +
      'JOIN content c ON c.topic_id = t.id ' +
      'WHERE t.id = ? LIMIT 1';

    const res = await engineApi.queryModule(mod.path, sql, [String(topicId)]);
    const row = (res.rows || [])[0];
    if (!row) return null;

    return {
      id: row.id,
      title: String(row.subject || ''),
      html: cleanTwmData(row.data ?? '')
    };
  }
};
