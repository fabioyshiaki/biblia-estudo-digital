import { myswordAdapter } from './adapter-mysword.js';
import { mybibleAdapter } from './adapter-mybible.js';
import { eswordAdapter } from './adapter-esword.js';
import { thewordTwmAdapter } from './adapter-theword-twm.js';
import { thewordOntAdapter } from './adapter-theword-ont.js';
import { normalizeStrongCode } from './sanitizer.js';

function getAdapter(mod) {
  if (!mod) return null;
  if (mod.format === 'mybible') return mybibleAdapter;
  if (mod.format === 'mysword') return myswordAdapter;
  if (mod.format === 'esword') return eswordAdapter;
  if (mod.format === 'theword') {
    if (mod.isSqlite) return thewordTwmAdapter;
    const name = mod.fileName || mod.path || '';
    if (/\.(ont|nt|ot)$/i.test(name)) return thewordOntAdapter;
  }
  return null;
}

function strongVariants(code) {
  const norm = normalizeStrongCode(code);
  const m = norm.match(/^([GH])(\d+)$/);
  if (!m) return [norm];
  const padded = `${m[1]}${m[2].padStart(4, '0')}`;
  return padded === norm ? [norm] : [norm, padded];
}

export const moduleReader = {
  isSupported(mod) {
    return Boolean(getAdapter(mod));
  },

  async readChapter(mod, bookId, chapter) {
    const adapter = getAdapter(mod);
    if (!adapter) {
      throw new Error(`Formato "${mod?.format}" não suportado para leitura bíblica.`);
    }
    return adapter.getChapter(mod, bookId, chapter);
  },

  async readCommentary(mod, bookId, chapter) {
    const adapter = getAdapter(mod);
    if (!adapter || typeof adapter.getCommentaryForChapter !== 'function') {
      throw new Error(`Comentário no formato "${mod?.format}" ainda não suportado.`);
    }
    return adapter.getCommentaryForChapter(mod, bookId, chapter);
  },

  async lookupDictionary(mod, term) {
    const adapter = getAdapter(mod);
    if (!adapter || typeof adapter.lookupDictionary !== 'function') {
      throw new Error(`Dicionário no formato "${mod?.format}" ainda não suportado.`);
    }

    const candidates = strongVariants(term);
    for (const candidate of candidates) {
      const res = await adapter.lookupDictionary(mod, candidate);
      if (res.entries && res.entries.length > 0) return res;
    }
    return { entries: [], queryMs: 0 };
  },

  async listBookTopics(mod, limit = 80, offset = 0) {
    const adapter = getAdapter(mod);
    if (!adapter || typeof adapter.getBookTopics !== 'function') {
      return { topics: [], queryMs: 0 };
    }
    return adapter.getBookTopics(mod, limit, offset);
  },

  async readBookTopic(mod, topicId) {
    const adapter = getAdapter(mod);
    if (!adapter || typeof adapter.getBookTopicContent !== 'function') {
      return null;
    }
    return adapter.getBookTopicContent(mod, topicId);
  }
};
