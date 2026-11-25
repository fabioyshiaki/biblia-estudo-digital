import { store } from '../core/store.js';
import { events } from '../core/events.js';
import { formatRef, parseReference } from '../core/canon.js';
import { moduleReader } from '../formats/module-reader.js';
import { userDataRepo, HIGHLIGHT_COLORS } from '../study/user-data-repo.js';

const $ = (id) => document.getElementById(id);

const ROB_POS = {
  N: 'Substantivo', V: 'Verbo', A: 'Adjetivo', P: 'Pronome', T: 'Artigo',
  D: 'Advérbio', C: 'Conjunção', PREP: 'Preposição', PRT: 'Partícula', CONJ: 'Conjunção'
};
const ROB_TENSE = { P: 'Presente', I: 'Imperfeito', F: 'Futuro', A: 'Aoristo', X: 'Perfeito', Y: 'Mais-que-perfeito' };
const ROB_VOICE = { A: 'Ativa', M: 'Média', P: 'Passiva', E: 'Média/Passiva', D: 'Depoente' };
const ROB_MOOD = { I: 'Indicativo', S: 'Subjuntivo', O: 'Optativo', M: 'Imperativo', N: 'Infinitivo', P: 'Particípio' };
const ROB_CASE = { N: 'Nominativo', G: 'Genitivo', D: 'Dativo', A: 'Acusativo', V: 'Vocativo' };

function decodeMorphQuick(code) {
  const parts = String(code || '').trim().toUpperCase().split('-');
  if (parts.length < 2) return code;
  const out = [];
  if (ROB_POS[parts[0]]) out.push(ROB_POS[parts[0]]);
  if (parts[0] === 'V' && parts[1] && parts[1].length >= 3) {
    const [t, v, m] = parts[1].split('');
    if (ROB_TENSE[t]) out.push(ROB_TENSE[t]);
    if (ROB_VOICE[v]) out.push(ROB_VOICE[v]);
    if (ROB_MOOD[m]) out.push(ROB_MOOD[m]);
  } else if (parts[1] && ROB_CASE[parts[1][0]]) {
    out.push(ROB_CASE[parts[1][0]]);
  }
  return out.length > 0 ? `${code} · ${out.join(' · ')}` : code;
}

function parseMySwordXref(raw) {
  const clean = String(raw || '').trim();
  const numMatch = clean.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (numMatch) {
    return { bookId: Number(numMatch[1]), chapter: Number(numMatch[2]), verse: Number(numMatch[3]) };
  }
  const parsed = parseReference(clean);
  if (!parsed) return null;
  return { bookId: parsed.bookId, chapter: parsed.chapter, verse: parsed.verseStart || 1 };
}

function pickStrongDictionary() {
  const active = store.getModuleById(store.state.activeDictId);
  if (active && active.type === 'dictionary' && moduleReader.isSupported(active)) return active;
  return store.state.modules.find((m) => m.type === 'dictionary' && m.hasStrong && moduleReader.isSupported(m))
    || store.state.modules.find((m) => m.type === 'dictionary' && moduleReader.isSupported(m))
    || null;
}

function stripTags(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function showBar({ head, text, extraNode = null, actions = [] }) {
  const bar = $('instant-details-bar');$('instant-head').textContent = head;
  $('instant-text').textContent = text;

  const extraEl = $('instant-extra');
  if (extraEl) {
    extraEl.innerHTML = '';
    if (extraNode) extraEl.appendChild(extraNode);
  }

  const actionsEl = $('instant-actions');
  actionsEl.innerHTML = '';

  for (const act of actions) {
    const btn = document.createElement('button');
    btn.className = act.primary ? 'btn-primary' : 'btn-ghost';
    btn.style.padding = '5px 9px';
    btn.style.fontSize = '12px';
    btn.textContent = act.label;
    btn.addEventListener('click', act.onClick);
    actionsEl.appendChild(btn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'icon-btn';
  closeBtn.textContent = '×';
  closeBtn.title = 'Fechar';
  closeBtn.addEventListener('click', hideBar);
  actionsEl.appendChild(closeBtn);

  bar.classList.remove('hidden');
}

function hideBar() {
  $('instant-details-bar').classList.add('hidden');
}

function buildHighlightPalette(bcv, activeColor) {
  const wrap = document.createElement('div');
  wrap.className = 'hl-palette';

  const label = document.createElement('span');
  label.className = 'hl-label';
  label.textContent = 'Grifar:';
  wrap.appendChild(label);

  for (const c of HIGHLIGHT_COLORS) {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = `hl-dot hl-dot-${c.id} ${activeColor === c.id ? 'active' : ''}`;
    dot.title = c.label;
    dot.addEventListener('click', async () => {
      const next = activeColor === c.id ? '' : c.id;
      await userDataRepo.setHighlight(bcv.bookId, bcv.chapter, bcv.verse, next);
      activeColor = next;
      wrap.querySelectorAll('.hl-dot').forEach((el) => el.classList.remove('active'));
      if (next) dot.classList.add('active');
    });
    wrap.appendChild(dot);
  }

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'hl-clear-btn';
  clearBtn.title = 'Remover grifo';
  clearBtn.textContent = 'Limpar';
  clearBtn.addEventListener('click', async () => {
    await userDataRepo.setHighlight(bcv.bookId, bcv.chapter, bcv.verse, '');
    activeColor = '';
    wrap.querySelectorAll('.hl-dot').forEach((el) => el.classList.remove('active'));
  });
  wrap.appendChild(clearBtn);

  return wrap;
}

async function handleStrongClick(code) {
  const dict = pickStrongDictionary();
  const baseActions = [
    {
      label: 'Dicionário',
      primary: true,
      onClick: () => {
        store.setStudyTab('dictionary');
        events.emit('study:lookup-dict', { term: code });
      }
    },
    {
      label: 'Buscar Ocorrências',
      onClick: () => events.emit('study:open-search', { query: code })
    }
  ];

  showBar({
    head: `Strong ${code}${dict ? ` · ${dict.abbr}` : ''}`,
    text: dict ? 'Consultando dicionário local...' : 'Nenhum dicionário compatível no catálogo.',
    actions: baseActions
  });

  if (!dict) return;
  try {
    const res = await moduleReader.lookupDictionary(dict, code);
    const first = res.entries[0];
    const preview = first ? stripTags(first.html).slice(0, 180) : 'Verbete não encontrado neste dicionário.';
    showBar({
      head: `Strong ${code} · ${dict.abbr} (${res.queryMs} ms)`,
      text: preview,
      actions: baseActions
    });
  } catch (err) {
    showBar({ head: `Strong ${code}`, text: `Erro: ${err.message || err}`, actions: baseActions });
  }
}

export const instantDetails = {
  init() {
    events.on('word:selected', ({ strong, morph }) => {
      if (strong) {
        handleStrongClick(strong);
      } else if (morph) {
        showBar({
          head: 'Análise Morfológica',
          text: decodeMorphQuick(morph),
          actions: [{
            label: 'Buscar no Dicionário',
            onClick: () => {
              store.setStudyTab('dictionary');
              events.emit('study:lookup-dict', { term: morph });
            }
          }]
        });
      }
    });

    events.on('note:preview', ({ note, bcv }) => {
      showBar({ head: `Nota · ${formatRef(bcv)}`, text: note || 'Sem texto.' });
    });

    events.on('xref:preview', ({ ref }) => {
      const target = parseMySwordXref(ref);
      const label = target ? formatRef({ ...target, verseStart: target.verse }) : ref;
      showBar({
        head: 'Referência Cruzada',
        text: label,
        actions: target ? [{
          label: `Ir para ${label}`,
          primary: true,
          onClick: () => {
            store.setCurrentBcv(target);
            hideBar();
          }
        }] : []
      });
    });

    events.on('verse:selected', ({ bcv, moduleId, text, highlightColor = '' }) => {
      const refText = formatRef({ ...bcv, verseStart: bcv.verse });
      const activeMod = store.getModuleById(moduleId);

      showBar({
        head: refText,
        text: text || '',
        extraNode: buildHighlightPalette(bcv, highlightColor),
        actions: [
          {
            label: 'Anotar',
            primary: true,
            onClick: () => {
              events.emit('study:open-note-composer', {
                bookId: bcv.bookId,
                chapter: bcv.chapter,
                verseStart: bcv.verse,
                verseEnd: bcv.verse
              });
            }
          },
          {
            label: 'Marcar',
            onClick: async () => {
              await userDataRepo.saveBookmark({
                bookId: bcv.bookId,
                chapter: bcv.chapter,
                verse: bcv.verse,
                label: (text || '').slice(0, 70)
              });
              showBar({ head: refText, text: 'Marcador salvo em user_data.db.' });
            }
          },
          {
            label: 'Recortar',
            onClick: async () => {
              await userDataRepo.saveClipping({
                bookId: bcv.bookId,
                chapter: bcv.chapter,
                verse: bcv.verse,
                sourceTitle: activeMod ? (activeMod.abbr || activeMod.title) : '',
                excerpt: text || ''
              });
              showBar({ head: refText, text: 'Recorte salvo na aba Anotações → Recortes.' });
            }
          },
          {
            label: 'IA',
            onClick: () => {
              events.emit('study:ask-ai', {
                prompt: `Explique o sentido exegético e o contexto de ${refText}.`
              });
            }
          },
          {
            label: 'Com.',
            onClick: () => store.setStudyTab('commentary')
          },
          {
            label: 'Copiar',
            onClick: () => {
              if (navigator.clipboard) navigator.clipboard.writeText(`${refText} — ${text}`);
              showBar({ head: refText, text: 'Versículo copiado para a área de transferência.' });
            }
          }
        ]
      });
    });

    events.on('nav:goto', hideBar);
  },

  hide: hideBar
};
