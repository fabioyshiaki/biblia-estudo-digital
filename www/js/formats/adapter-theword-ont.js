import { engineApi } from '../bridge/engine-api.js';
import { sanitizeVerseHtml } from './sanitizer.js';

function preprocessTheWordTags(raw) {
  let text = String(raw || '');

  // Citações do Antigo Testamento no NT (<FO>...</Fo>)
  text = text.replace(/<FO>(.*?)<\/Fo>/gi, '<em class="v-added">$1</em>');

  // Formatação editorial própria do theWord
  text = text.replace(/<FB>(.*?)<\/Fb>/gi, '<strong>$1</strong>');
  text = text.replace(/<FU>(.*?)<\/Fu>/gi, '<u>$1</u>');
  text = text.replace(/<FS>(.*?)<\/Fs>/gi, '<sup>$1</sup>');
  text = text.replace(/<Sub>(.*?)<\/Sub>/gi, '<sub>$1</sub>');

  // Blocos semânticos/títulos extras (<ST>...</St>) e quebras (<CI>, <PF0..9>)
  text = text.replace(/<ST>(.*?)<\/St>/gi, '<span class="v-subheading">$1</span>');
  text = text.replace(/<(CI|PF\d?)>/gi, '<br />');

  // Remove marcadores de controle visual proprietários do theWord sem apagar o texto interno
  text = text.replace(/<\/?(NB|X|R|q|v)[^>]*>/gi, '');

  return text;
}

export const thewordOntAdapter = {
  async getChapter(mod, bookId, chapter) {
    const res = await engineApi.readTheWordChapter(mod.path, bookId, chapter);
    const rawVerses = Array.isArray(res.verses) ? res.verses : [];

    const verses = [];
    for (const item of rawVerses) {
      const raw = String(item.raw || '').trim();
      if (!raw) continue;

      const prepared = preprocessTheWordTags(raw);
      verses.push({
        verse: Number(item.verse || 0),
        raw,
        html: sanitizeVerseHtml(prepared, 'mysword')
      });
    }

    return {
      verses,
      queryMs: res.queryMs || 0,
      indexedNow: Boolean(res.indexedNow)
    };
  }
};
