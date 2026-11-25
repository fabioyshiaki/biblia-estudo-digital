import { store } from '../core/store.js';
import { formatRef } from '../core/canon.js';
import { moduleReader } from '../formats/module-reader.js';
import { userDataRepo } from '../study/user-data-repo.js';

const CONFIG_KEY = 'bed_gemini_cfg_v1';

export const GEMINI_MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Rápido / Padrão)' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Exegese Profunda)' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite (Ultraleve)' }
];

const SYSTEM_PROMPT =
  'Você é um assistente acadêmico de estudos bíblicos e teologia (exegese, hermenêutica, línguas originais, ' +
  'contexto histórico-cultural e homilética). Responda sempre em português claro, objetivo e bem estruturado. ' +
  'Priorize fielmente o texto bíblico, comentários e notas pessoais fornecidos no contexto local abaixo. ' +
  'Quando mencionar termos hebraicos/gregos ou escolas interpretativas, seja preciso e evite inventar citações.';

function stripHtml(html) {
  return String(html || '')
    .replace(/<button[^>]*>[\s\S]*?<\/button>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const geminiService = {
  getConfig() {
    try {
      const raw = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
      return {
        apiKey: String(raw.apiKey || '').trim(),
        model: String(raw.model || 'gemini-2.5-flash').trim()
      };
    } catch {
      return { apiKey: '', model: 'gemini-2.5-flash' };
    }
  },

  saveConfig({ apiKey, model }) {
    const clean = {
      apiKey: String(apiKey || '').trim(),
      model: String(model || 'gemini-2.5-flash').trim() || 'gemini-2.5-flash'
    };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(clean));
    return clean;
  },

  hasApiKey() {
    return this.getConfig().apiKey.length > 10;
  },

  async buildStudyContext({ includePassage = true, includeCommentary = true, includeNotes = true } = {}) {
    const cur = store.state.currentBcv;
    const refLabel = formatRef({ ...cur, verseStart: cur.verse });
    const blocks = [`PASSAGEM ATIVA: ${refLabel}`];

    if (includePassage) {
      const bible = store.getModuleById(store.state.activeBibleId);
      if (bible && moduleReader.isSupported(bible)) {
        try {
          const ch = await moduleReader.readChapter(bible, cur.bookId, cur.chapter);
          const vCenter = cur.verse || 1;
          const windowVerses = (ch.verses || []).filter((v) => v.verse >= vCenter - 3 && v.verse <= vCenter + 5);
          const selected = windowVerses.length > 0 ? windowVerses : (ch.verses || []).slice(0, 12);
          const lines = selected.map((v) => `${v.verse}. ${stripHtml(v.html)}`).join('\n');
          blocks.push(`TEXTO (${bible.abbr}):\n${lines.slice(0, 2600)}`);
        } catch {
          // Segue sem texto se módulo falhar
        }
      }
    }

    if (includeCommentary) {
      const cmt = store.getModuleById(store.state.activeCommentaryId);
      if (cmt && moduleReader.isSupported(cmt)) {
        try {
          const res = await moduleReader.readCommentary(cmt, cur.bookId, cur.chapter);
          const relevant = (res.entries || []).filter(
            (e) => cur.verse >= e.fromVerse && cur.verse <= e.toVerse
          );
          const picked = relevant.length > 0 ? relevant : (res.entries || []).slice(0, 2);
          if (picked.length > 0) {
            const text = picked.map((e) => stripHtml(e.html)).join('\n\n').slice(0, 2400);
            blocks.push(`COMENTÁRIO LOCAL (${cmt.abbr}):\n${text}`);
          }
        } catch {
          // Segue sem comentário
        }
      }
    }

    if (includeNotes) {
      try {
        const notes = await userDataRepo.getNotes({ bookId: cur.bookId, chapter: cur.chapter });
        if (notes.length > 0) {
          const text = notes
            .slice(0, 4)
            .map((n) => `[${formatRef(n)}] ${n.title ? `${n.title}: ` : ''}${n.body}`)
            .join('\n')
            .slice(0, 1500);
          blocks.push(`NOTAS PESSOAIS DO ESTUDANTE:\n${text}`);
        }
      } catch {
        // Ignora erro de notas
      }
    }

    return blocks.join('\n\n---\n\n');
  },

  async ask({ prompt, history = [], contextOptions = {} }) {
    const { apiKey, model } = this.getConfig();
    if (!apiKey) {
      throw new Error('Configure sua chave da Gemini API em "⚙ API Key" antes de consultar.');
    }

    const contextText = await this.buildStudyContext(contextOptions);
    const contents = [];

    for (const msg of history.slice(-6)) {
      contents.push({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: String(msg.text || '') }]
      });
    }

    contents.push({
      role: 'user',
      parts: [{ text: `${contextText}\n\nPERGUNTA DO ESTUDANTE:\n${prompt}` }]
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 2048
        }
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const apiMsg = data?.error?.message || `HTTP ${response.status}`;
      throw new Error(`Gemini API: ${apiMsg}`);
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const answer = parts.map((p) => p.text || '').join('\n').trim();
    if (!answer) {
      throw new Error('O modelo retornou resposta vazia.');
    }
    return { answer, model };
  }
};
