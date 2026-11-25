import { store } from '../core/store.js';
import { events } from '../core/events.js';
import { formatRef, parseReference } from '../core/canon.js';
import { moduleReader } from '../formats/module-reader.js';

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
    return {
      bookId: Number(numMatch[1]),
      chapter: Number(numMatch[2]),
      verse: Number(numMatch[3])
    };
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

function showBar({ head, text, actions = [] }) {
  const bar = $('instant-details-bar');
  $('instant-head').textContent = head;
  $('instant-text').textContent = text;

  const actionsEl = $('instant-actions');
  actionsEl.innerHTML = '';

  for (const act of actions) {
    const btn = document.createElement('button');
    btn.className = act.primary ? 'btn-primary' : 'btn-ghost';
    btn.style.padding = '6px 10px';
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

async function handleStrongClick(code) {
  const dict = pickStrongDictionary();
  showBar({
    head: `Strong ${code}${dict ? ` · ${dict.abbr}` : ''}`,
    text: dict ? 'Consultando dicionário local...' : 'Nenhum dicionário compatível no catálogo.',
    actions: [{
      label: 'Abrir Dicionário',
      primary: true,
      onClick: () => {
        store.setStudyTab('dictionary');
        events.emit('study:lookup-dict', { term: code });
      }
    }]
  });

  if (!dict) return;
  try {
    const res = await moduleReader.lookupDictionary(dict, code);
    const first = res.entries[0];
    const preview = first ? stripTags(first.html).slice(0, 180) : 'Verbete não encontrado neste dicionário.';
    showBar({
      head: `Strong ${code} · ${dict.abbr} (${res.queryMs} ms)`,
      text: preview,
      actions: [{
        label: 'Abrir Completo',
        primary: true,
        onClick: () => {
          store.setStudyTab('dictionary');
          events.emit('study:lookup-dict', { term: code });
        }
      }]
    });
  } catch (err) {
    showBar({ head: `Strong ${code}`, text: `Erro: ${err.message || err}` });
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

    events.on('verse:selected', ({ bcv, text }) => {
      const refText = formatRef({ ...bcv, verseStart: bcv.verse });
      showBar({
        head: refText,
        text: text || '',
        actions: [
          {
            label: 'Comentários',
            primary: true,
            onClick: () => store.setStudyTab('commentary')
          },
          {
            label: 'Copiar',
            onClick: () => {
              if (navigator.clipboard) {
                navigator.clipboard.writeText(`${refText} — ${text}`);
              }
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
