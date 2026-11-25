import { engineApi } from '../bridge/engine-api.js';
import { sanitizeArticleHtml } from './sanitizer.js';

const epubInfoCache = new Map();

function cleanEpubHtml(raw) {
  let html = String(raw || '');

  // Substitui imagens com caminhos relativos internos do ZIP por marcador limpo
  html = html.replace(/<img\b[^>]*>/gi, (tag) => {
    if (/src\s*=\s*["']data:/i.test(tag)) return tag;
    return '<span class="muted-text">[Imagem embutida no EPUB]</span>';
  });

  // Remove âncoras quebradas mantendo o texto visível
  html = html.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1');

  return sanitizeArticleHtml(html, 'mysword');
}

async function getCachedInfo(mod) {
  if (epubInfoCache.has(mod.path)) {
    return epubInfoCache.get(mod.path);
  }
  const info = await engineApi.getEpubInfo(mod.path);
  if (epubInfoCache.size >= 8) {
    const oldest = epubInfoCache.keys().next().value;
    epubInfoCache.delete(oldest);
  }
  epubInfoCache.set(mod.path, info);
  return info;
}

export const epubAdapter = {
  async getInfo(mod) {
    return getCachedInfo(mod);
  },

  async getBookTopics(mod, limit = 200, offset = 0) {
    const info = await getCachedInfo(mod);
    const list = (info.chapters || []).slice(offset, offset + limit);
    return {
      topics: list.map((ch) => ({
        id: Number(ch.index),
        title: String(ch.title || `Capítulo ${Number(ch.index) + 1}`)
      })),
      totalCount: Number(info.chapterCount || list.length),
      queryMs: info.queryMs || 0
    };
  },

  async getBookTopicContent(mod, topicId) {
    const index = Number(topicId);
    const res = await engineApi.readEpubChapter(mod.path, index);
    return {
      id: Number(res.index),
      title: String(res.title || `Capítulo ${index + 1}`),
      html: cleanEpubHtml(res.html || ''),
      chapterCount: Number(res.chapterCount || 0),
      queryMs: res.queryMs || 0
    };
  }
};
