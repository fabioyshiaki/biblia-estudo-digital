import { store } from '../core/store.js';
import { formatRef } from '../core/canon.js';
import { userDataRepo } from '../study/user-data-repo.js';
import { geminiService, GEMINI_MODELS } from '../ai/gemini-service.js';

const PRESETS = [
  { label: 'Exegese', prompt: 'Faça uma análise exegética clara da passagem ativa, destacando estrutura do texto, sentido no contexto imediato e implicações teológicas.' },
  { label: 'Contexto Histórico', prompt: 'Explique o contexto histórico, cultural e literário desta passagem e por que ele ilumina o sentido original.' },
  { label: 'Termos Originais', prompt: 'Analise os principais termos teológicos do texto original (hebraico/grego) presentes nesta passagem, seus matizes semânticos e uso em outros textos bíblicos.' },
  { label: 'Esboço', prompt: 'Crie um esboço expositivo equilibrado (introdução, 3 pontos fiéis ao texto e aplicação prática) baseado nesta passagem.' },
  { label: 'Conexões Bíblicas', prompt: 'Liste e explique as principais conexões intertextuais (AT e NT) relacionadas a esta passagem.' }
];

let showSettings = false;
let isLoading = false;
let includePassage = true;
let includeCommentary = true;
let includeNotes = true;
let messages = [];
let pendingPrompt = null;

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderSimpleMarkdown(md) {
  const escaped = escapeHtml(md);
  const lines = escaped.split(/\r?\n/);
  const out = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');

    if (/^###\s+/.test(line)) {
      closeList();
      out.push(`<h4>${line.replace(/^###\s+/, '')}</h4>`);
    } else if (/^##\s+/.test(line)) {
      closeList();
      out.push(`<h3>${line.replace(/^##\s+/, '')}</h3>`);
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${line.replace(/^[-*]\s+/, '')}</li>`);
    } else if (line.trim() === '') {
      closeList();
    } else {
      closeList();
      out.push(`<p>${line}</p>`);
    }
  }
  closeList();
  return out.join('');
}

function renderConfigCard(body, requestRefresh) {
  const cfg = geminiService.getConfig();
  const card = document.createElement('div');
  card.className = 'study-form-card';

  const head = document.createElement('div');
  head.className = 'study-entry-head';
  head.textContent = 'Configuração Gemini API (Chave Pessoal / BYOK)';

  const info = document.createElement('p');
  info.className = 'muted-text';
  info.textContent = 'Sua chave fica salva apenas neste tablet (localStorage) e envia requisições direto ao endpoint oficial do Google.';

  const keyInput = document.createElement('input');
  keyInput.type = 'password';
  keyInput.placeholder = 'Cole sua Gemini API Key (AIza...)';
  keyInput.value = cfg.apiKey;

  const modelSel = document.createElement('select');
  modelSel.className = 'ui-select';
  const known = GEMINI_MODELS.some((m) => m.id === cfg.model);
  for (const m of GEMINI_MODELS) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.label;
    if (m.id === cfg.model) opt.selected = true;
    modelSel.appendChild(opt);
  }
  if (!known && cfg.model) {
    const opt = document.createElement('option');
    opt.value = cfg.model;
    opt.textContent = cfg.model;
    opt.selected = true;
    modelSel.appendChild(opt);
  }

  const customModel = document.createElement('input');
  customModel.type = 'text';
  customModel.placeholder = 'Opcional: nome exato de outro modelo Gemini';
  customModel.value = known ? '' : cfg.model;

  const actions = document.createElement('div');
  actions.className = 'btn-row';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-primary';
  saveBtn.textContent = 'Salvar configuração';
  saveBtn.addEventListener('click', () => {
    const chosenModel = customModel.value.trim() || modelSel.value;
    geminiService.saveConfig({ apiKey: keyInput.value, model: chosenModel });
    showSettings = false;
    requestRefresh();
  });

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-ghost';
  closeBtn.textContent = 'Fechar';
  closeBtn.addEventListener('click', () => {
    showSettings = false;
    requestRefresh();
  });

  actions.append(saveBtn, closeBtn);
  card.append(head, info, keyInput, modelSel, customModel, actions);
  body.appendChild(card);
}

async function sendPrompt(promptText, requestRefresh) {
  const clean = String(promptText || '').trim();
  if (!clean || isLoading) return;

  const refSnapshot = { ...store.state.currentBcv };
  const refLabel = formatRef({ ...refSnapshot, verseStart: refSnapshot.verse });
  const historyBefore = [...messages];

  messages.push({ role: 'user', text: clean, refLabel });
  isLoading = true;
  requestRefresh();

  try {
    const res = await geminiService.ask({
      prompt: clean,
      history: historyBefore,
      contextOptions: { includePassage, includeCommentary, includeNotes }
    });
    messages.push({
      role: 'model',
      text: res.answer,
      model: res.model,
      refLabel,
      bcv: refSnapshot
    });
  } catch (err) {
    messages.push({
      role: 'error',
      text: err.message || String(err),
      refLabel
    });
  } finally {
    isLoading = false;
    requestRefresh();
  }
}

export const aiPanel = {
  askAboutPassage(promptText) {
    pendingPrompt = promptText;
  },

  async render(subbar, body, hooks) {
    subbar.innerHTML = '';

    const ctxFlags = [
      ['Passagem', includePassage, (v) => { includePassage = v; }],
      ['Com.', includeCommentary, (v) => { includeCommentary = v; }],
      ['Notas', includeNotes, (v) => { includeNotes = v; }]
    ];
    for (const [label, active, setter] of ctxFlags) {
      const chip = document.createElement('button');
      chip.className = `chip ${active ? 'active' : ''}`;
      chip.textContent = label;
      chip.addEventListener('click', () => {
        setter(!active);
        hooks.requestRefresh();
      });
      subbar.appendChild(chip);
    }

    const cfgBtn = document.createElement('button');
    cfgBtn.className = `btn-ghost ${showSettings ? 'active' : ''}`;
    cfgBtn.style.marginLeft = 'auto';
    cfgBtn.style.padding = '5px 10px';
    cfgBtn.style.fontSize = '12px';
    cfgBtn.textContent = geminiService.hasApiKey() ? '⚙ API Key' : '⚙ Configurar Key';
    cfgBtn.addEventListener('click', () => {
      showSettings = !showSettings;
      hooks.requestRefresh();
    });

    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn-ghost';
    clearBtn.style.padding = '5px 10px';
    clearBtn.style.fontSize = '12px';
    clearBtn.textContent = 'Limpar';
    clearBtn.addEventListener('click', () => {
      messages = [];
      hooks.requestRefresh();
    });

    subbar.append(cfgBtn, clearBtn);
    body.innerHTML = '';

    if (showSettings || !geminiService.hasApiKey()) {
      renderConfigCard(body, hooks.requestRefresh);
    }

    const cur = store.state.currentBcv;
    const refLabel = formatRef({ ...cur, verseStart: cur.verse });

    const presetRow = document.createElement('div');
    presetRow.className = 'chip-row';
    for (const p of PRESETS) {
      const btn = document.createElement('button');
      btn.className = 'chip';
      btn.disabled = isLoading;
      btn.textContent = p.label;
      btn.addEventListener('click', () => sendPrompt(p.prompt, hooks.requestRefresh));
      presetRow.appendChild(btn);
    }
    body.appendChild(presetRow);

    const log = document.createElement('div');
    log.className = 'ai-log';

    if (messages.length === 0) {
      log.innerHTML = `<p class="empty-state">Assistente pronto para <strong>${refLabel}</strong>. Escolha um atalho acima ou faça sua pergunta abaixo.</p>`;
    } else {
      for (const msg of messages) {
        const card = document.createElement('article');
        card.className = `ai-msg ai-msg-${msg.role}`;

        const head = document.createElement('div');
        head.className = 'study-card-head';

        const who = document.createElement('span');
        who.className = 'study-entry-head';
        who.style.margin = '0';
        who.textContent = msg.role === 'user'
          ? `Você · ${msg.refLabel}`
          : (msg.role === 'error' ? 'Aviso' : `Gemini (${msg.model || ''}) · ${msg.refLabel}`);
        head.appendChild(who);

        if (msg.role === 'model') {
          const actions = document.createElement('div');
          actions.className = 'btn-row';

          const saveBtn = document.createElement('button');
          saveBtn.className = 'btn-ghost';
          saveBtn.style.padding = '3px 8px';
          saveBtn.style.fontSize = '11.5px';
          saveBtn.textContent = 'Salvar Nota';
          saveBtn.addEventListener('click', async () => {
            const bcv = msg.bcv || store.state.currentBcv;
            await userDataRepo.saveNote({
              bookId: bcv.bookId,
              chapter: bcv.chapter,
              verseStart: bcv.verse || 1,
              verseEnd: bcv.verse || 1,
              title: `Estudo IA · ${msg.refLabel}`,
              body: msg.text,
              tagsCsv: 'ia,gemini'
            });
            saveBtn.textContent = 'Salva ✓';
            saveBtn.disabled = true;
          });

          const copyBtn = document.createElement('button');
          copyBtn.className = 'btn-ghost';
          copyBtn.style.padding = '3px 8px';
          copyBtn.style.fontSize = '11.5px';
          copyBtn.textContent = 'Copiar';
          copyBtn.addEventListener('click', () => {
            if (navigator.clipboard) navigator.clipboard.writeText(msg.text);
            copyBtn.textContent = 'Copiado ✓';
          });

          actions.append(saveBtn, copyBtn);
          head.appendChild(actions);
        }

        const content = document.createElement('div');
        content.className = 'study-article';
        if (msg.role === 'model') {
          content.innerHTML = renderSimpleMarkdown(msg.text);
        } else {
          content.textContent = msg.text;
        }

        card.append(head, content);
        log.appendChild(card);
      }
    }

    if (isLoading) {
      const loading = document.createElement('p');
      loading.className = 'muted-text';
      loading.textContent = 'Consultando Gemini com o contexto local...';
      log.appendChild(loading);
    }

    body.appendChild(log);

    const composer = document.createElement('div');
    composer.className = 'study-inline-bar';
    composer.style.marginTop = '12px';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = `Perguntar sobre ${refLabel}...`;
    input.disabled = isLoading;
    input.style.flex = '1';

    const sendBtn = document.createElement('button');
    sendBtn.className = 'btn-primary';
    sendBtn.textContent = isLoading ? '...' : 'Enviar';
    sendBtn.disabled = isLoading;

    const trigger = () => sendPrompt(input.value, hooks.requestRefresh);
    sendBtn.addEventListener('click', trigger);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') trigger();
    });

    composer.append(input, sendBtn);
    body.appendChild(composer);
    body.scrollTop = body.scrollHeight;

    if (pendingPrompt && !isLoading) {
      const q = pendingPrompt;
      pendingPrompt = null;
      sendPrompt(q, hooks.requestRefresh);
    }
  }
};
