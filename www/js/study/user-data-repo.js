import { engineApi } from '../bridge/engine-api.js';
import { events } from '../core/events.js';

export const HIGHLIGHT_COLORS = [
  { id: 'amber', label: 'Âmbar' },
  { id: 'sage', label: 'Verde' },
  { id: 'sky', label: 'Azul' },
  { id: 'rose', label: 'Rosa' },
  { id: 'violet', label: 'Lilás' }
];

const chapterHighlightsCache = new Map();

function chapterKey(bookId, chapter) {
  return `${Number(bookId)}:${Number(chapter)}`;
}

function clearCaches() {
  chapterHighlightsCache.clear();
}

export const userDataRepo = {
  async getChapterHighlights(bookId, chapter, { force = false } = {}) {
    const key = chapterKey(bookId, chapter);
    if (!force && chapterHighlightsCache.has(key)) {
      return chapterHighlightsCache.get(key);
    }

    const res = await engineApi.userDataAction('getChapterHighlights', {
      bookId: Number(bookId),
      chapter: Number(chapter)
    });

    const map = new Map();
    for (const item of res.highlights || []) {
      map.set(Number(item.verse), String(item.color));
    }

    if (chapterHighlightsCache.size >= 24) {
      const oldest = chapterHighlightsCache.keys().next().value;
      chapterHighlightsCache.delete(oldest);
    }
    chapterHighlightsCache.set(key, map);
    return map;
  },

  async setHighlight(bookId, chapter, verse, color) {
    const b = Number(bookId);
    const c = Number(chapter);
    const v = Number(verse);
    const cleanColor = String(color || '').trim();

    await engineApi.userDataAction('setHighlight', {
      bookId: b,
      chapter: c,
      verse: v,
      color: cleanColor
    });

    const key = chapterKey(b, c);
    const cached = chapterHighlightsCache.get(key);
    if (cached) {
      if (!cleanColor || cleanColor === 'none') cached.delete(v);
      else cached.set(v, cleanColor);
    }

    events.emit('userdata:highlights-changed', {
      bookId: b,
      chapter: c,
      verse: v,
      color: cleanColor
    });
  },

  async getNotes({ bookId = 0, chapter = 0, query = '' } = {}) {
    const res = await engineApi.userDataAction('getNotes', {
      bookId: Number(bookId) || 0,
      chapter: Number(chapter) || 0,
      query: String(query || '').trim()
    });
    return res.notes || [];
  },

  async saveNote(note) {
    const payload = {
      id: note.id || '',
      bookId: Number(note.bookId || 1),
      chapter: Number(note.chapter || 1),
      verseStart: Number(note.verseStart || 1),
      verseEnd: Number(note.verseEnd || note.verseStart || 1),
      title: String(note.title || '').trim(),
      body: String(note.body || '').trim(),
      tagsCsv: String(note.tagsCsv || '').trim()
    };
    if (note.createdAt) payload.createdAt = Number(note.createdAt);

    const res = await engineApi.userDataAction('saveNote', payload);
    events.emit('userdata:notes-changed', {
      bookId: payload.bookId,
      chapter: payload.chapter,
      id: res.id
    });
    return res;
  },

  async deleteNote(id) {
    await engineApi.userDataAction('deleteNote', { id: String(id || '') });
    events.emit('userdata:notes-changed', { id });
  },

  async getBookmarks() {
    const res = await engineApi.userDataAction('getBookmarks', {});
    return res.bookmarks || [];
  },

  async saveBookmark(bm) {
    const payload = {
      id: bm.id || '',
      bookId: Number(bm.bookId || 1),
      chapter: Number(bm.chapter || 1),
      verse: Number(bm.verse || 1),
      label: String(bm.label || '').trim()
    };
    const res = await engineApi.userDataAction('saveBookmark', payload);
    events.emit('userdata:bookmarks-changed', { id: res.id });
    return res;
  },

  async deleteBookmark(id) {
    await engineApi.userDataAction('deleteBookmark', { id: String(id || '') });
    events.emit('userdata:bookmarks-changed', { id });
  },

  async getClippings({ bookId = 0, chapter = 0 } = {}) {
    const res = await engineApi.userDataAction('getClippings', {
      bookId: Number(bookId) || 0,
      chapter: Number(chapter) || 0
    });
    return res.clippings || [];
  },

  async saveClipping(clip) {
    const payload = {
      id: clip.id || '',
      bookId: Number(clip.bookId || 1),
      chapter: Number(clip.chapter || 1),
      verse: Number(clip.verse || 1),
      sourceTitle: String(clip.sourceTitle || '').trim(),
      excerpt: String(clip.excerpt || '').trim(),
      comment: String(clip.comment || '').trim()
    };
    const res = await engineApi.userDataAction('saveClipping', payload);
    events.emit('userdata:clippings-changed', { id: res.id });
    return res;
  },

  async deleteClipping(id) {
    await engineApi.userDataAction('deleteClipping', { id: String(id || '') });
    events.emit('userdata:clippings-changed', { id });
  },

  async getCounts() {
    return engineApi.userDataAction('getCounts', {});
  },

  async exportBackup(options = {}) {
    return engineApi.userDataAction('exportBackup', options);
  },

  async importBackup(options = {}) {
    const res = await engineApi.userDataAction('importBackup', options);
    clearCaches();
    events.emit('userdata:all-changed');
    return res;
  },

  clearCaches
};
