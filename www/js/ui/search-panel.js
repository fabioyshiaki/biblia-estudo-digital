import { store } from '../core/store.js';
import { formatRef } from '../core/canon.js';
import { engineApi } from '../bridge/engine-api.js';

let lastQuery = '';
let activeScope = 'active-bible';
let showIndexManager = false;
let lastResponse = null;
let statusMessage = '';

function resolveScopeModuleIds(scope) {
  const mods = store.state.modules.filter((m) => m.isSqlite && !m.locked);
  if (scope === 'active-bible') {
    return store.state.activeBibleId ? [store.state.activeBibleId] : [];
  }
  if (scope === 'fts-all') {
    return [];
  }
  if (scope === 'fav-bibles') {
    const favs = mods.filter((m) => m.type === 'bible' && m.favorite).map((m) => m.id);
    return favs.length > 0 ? favs : mods.filter((m) => m.type === 'bible').slice(0, 6).map((m) => m.id);
  }
  if (scope === 'fav-commentaries') {
    const favs = mods.filter((m) => m.type === 'commentary' && m.favorite).map((m) => m.id);
    return favs.length > 0 ? favs : mods.filter((m) => m.type === 'commentary').slice(0, 6).map((m) => m.id);
  }
  if (scope.startsWith('set:')) {
    const set = store.getSetById(scope.slice(4));
    return set ? set.moduleIds.slice(0, 20) : [];
  }
  return [];
}

function appendHighlightedSnippet(container, text, query) {
  const cleanQ = String(query || '').replace(/"/g, '').trim();
  if (!cleanQ || cleanQ.length < 2) {
    container.textContent = text;
    return;
  }
  const escaped = cleanQ.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = String(text || '').split(regex);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      const mark = document.createElement('mark');
      mark.className = 'search-hit';
      mark.textContent = parts[i];
      container.appendChild(mark);
    } else if (parts[i]) {
      container.appendChild(document.createTextNode(parts[i]));
    }
  }
}

async function renderIndexManager(body, { isStale, requestRefresh }) {
  body.innerHTML = '<p class="empty-state">Lendo estatísticas do índice FTS4...</p>';
  const stats = await engineApi.getSearchIndexStats();
  if (isStale()) return;

  const indexedMap = new Map();
  for (const item of stats.indexedModules || []) {
    indexedMap.set(item.moduleId, item);
  }

  body.innerHTML = '';
  const summary = document.createElement('p');
  summary.className = 'muted-text';
  summary.textContent =
    `Índice FTS4 isolado (search_index.db): ${(stats.indexedModules || []).length} Bíblias indexadas · ` +
    `${stats.totalVerses || 0} versículos prontos para busca instantânea.`;
  body.appendChild(summary);

  if (statusMessage) {
    const msg = document.createElement('p');
    msg.className = 'ok-text';
    msg.textContent = statusMessage;
    body.appendChild(msg);
  }

  const bibles = store.state.modules
    .filter((m) => m.type === 'bible' && m.isSqlite && !m.locked)
    .sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return (a.title || a.fileName).localeCompare(b.title || b.fileName, 'pt-BR');
    });

  const frag = document.createDocumentFragment();
  for (const mod of bibles.slice(0, 60)) {
    const info = indexedMap.get(mod.id);
    const row = document.createElement('div');
    row.className = 'rg-item';

    const left = document.createElement('div');
    left.style.minWidth = '0';
    const title = document.createElement('div');
    title.className = 'vrow-title';
    title.textContent = `${mod.favorite ? '★ ' : ''}${mod.title}`;
    const sub = document.createElement('div');
    sub.className = 'vrow-sub';
    sub.textContent = info
      ? `${mod.abbr} · Indexada (${info.verseCount} versículos)`
      : `${mod.abbr} · Ainda não indexada no FTS4`;
    left.append(title, sub);

    const btn = document.createElement('button');
    btn.className = info ? 'btn-ghost' : 'btn-primary';
    btn.style.padding = '5px 10px';
    btn.style.fontSize = '12px';
    btn.textContent = info ? 'Reindexar' : 'Indexar';
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      btn.disabled = true;
      btn.textContent = 'Indexando...';
      try {
        const res = await engineApi.indexModuleForSearch(mod.id);
        statusMessage = `${mod.abbr}: ${res.verseCount} versículos indexados em ${res.durationMs} ms.`;
      } catch (err) {
        statusMessage = `Erro ao indexar ${mod.abbr}: ${err.message || err}`;
      }
      requestRefresh();
    });

    row.append(left, btn);
    frag.appendChild(row);
  }
  body.appendChild(frag);
}

export const searchPanel = {
  setQuery(q) {
    lastQuery = String(q || '').trim();
    showIndexManager = false;
  },

  async render(subbar, body, hooks) {
    subbar.innerHTML = '';

    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Buscar texto, "frase exata" ou Strong (G26)...';
    input.value = lastQuery;
    input.style.flex = '1';
    input.style.minWidth = '150px';

    const scopeSel = document.createElement('select');
    scopeSel.className = 'ui-select';
    const baseScopes = [
      ['active-bible', 'Bíblia ativa'],
      ['fts-all', 'Indexadas (FTS4)'],
      ['fav-bibles', 'Bíblias favoritas'],
      ['fav-commentaries', 'Comentários fav.']
    ];
    for (const [val, label] of baseScopes) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      if (activeScope === val) opt.selected = true;
      scopeSel.appendChild(opt);
    }
    for (const set of store.state.moduleSets || []) {
      const val = `set:${set.id}`;
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = `Coleção: ${set.name}`;
      if (activeScope === val) opt.selected = true;
      scopeSel.appendChild(opt);
    }
    scopeSel.addEventListener('change', (e) => {
      activeScope = e.target.value;
    });

    const goBtn = document.createElement('button');
    goBtn.className = 'btn-primary';
    goBtn.textContent = 'Buscar';

    const idxBtn = document.createElement('button');
    idxBtn.className = `btn-ghost ${showIndexManager ? 'active' : ''}`;
    idxBtn.textContent = 'Índice FTS4';
    idxBtn.addEventListener('click', () => {
      showIndexManager = !showIndexManager;
      hooks.requestRefresh();
    });

    const runSearch = async () => {
      lastQuery = input.value.trim();
      showIndexManager = false;
      if (lastQuery.length < 2) return;
      body.innerHTML = '<p class="empty-state">Pesquisando nos módulos locais...</p>';
      try {
        const ids = resolveScopeModuleIds(activeScope);
        lastResponse = await engineApi.searchModules(lastQuery, ids, 100);
      } catch (err) {
        lastResponse = { error: err.message || String(err), results: [] };
      }
      hooks.requestRefresh();
    };

    goBtn.addEventListener('click', runSearch);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runSearch();
    });

    subbar.append(input, scopeSel, goBtn, idxBtn);

    if (showIndexManager) {
      await renderIndexManager(body, hooks);
      return;
    }

    body.innerHTML = '';
    if (!lastResponse) {
      body.innerHTML =
        '<p class="empty-state">Digite um termo para pesquisar offline em suas Bíblias e comentários. ' +
        'Toque em "Índice FTS4" para deixar suas Bíblias favoritas com busca instantânea.</p>';
      return;
    }

    if (lastResponse.error) {
      body.innerHTML = `<p class="empty-state">Erro na busca: ${lastResponse.error}</p>`;
      return;
    }

    const results = lastResponse.results || [];
    const meta = document.createElement('div');
    meta.className = 'study-entry-head';
    meta.textContent =
      `${results.length} resultado(s) em ${lastResponse.durationMs || 0} ms · ` +
      (lastResponse.usedFts ? 'Motor FTS4' : 'Busca direta somente leitura');
    body.appendChild(meta);

    if (results.length === 0) {
      const p = document.createElement('p');
      p.className = 'empty-state';
      p.textContent = 'Nenhuma ocorrência encontrada neste escopo.';
      body.appendChild(p);
      return;
    }

    const frag = document.createDocumentFragment();
    for (const r of results) {
      const card = document.createElement('div');
      card.className = 'rg-item';
      card.style.flexDirection = 'column';
      card.style.alignItems = 'stretch';

      const head = document.createElement('div');
      head.className = 'study-card-head';

      const ref = document.createElement('strong');
      ref.style.fontSize = '13px';
      ref.style.color = 'var(--accent)';
      ref.textContent = formatRef({ bookId: r.bookId, chapter: r.chapter, verseStart: r.verse });

      const badge = document.createElement('span');
      badge.className = 'tag-pill';
      badge.textContent = `${r.moduleAbbr || 'MOD'} · ${r.type === 'commentary' ? 'Com.' : 'Bíblia'}`;
      head.append(ref, badge);

      const snip = document.createElement('div');
      snip.className = 'study-note-body';
      snip.style.marginTop = '4px';
      appendHighlightedSnippet(snip, r.snippet, lastQuery);

      card.append(head, snip);
      card.addEventListener('click', () => {
        if (r.type === 'bible' && r.moduleId) {
          store.setActiveModule('bible', r.moduleId);
        } else if (r.type === 'commentary' && r.moduleId) {
          store.setActiveModule('commentary', r.moduleId);
          store.setStudyTab('commentary');
        }
        store.setCurrentBcv({ bookId: r.bookId, chapter: r.chapter, verse: r.verse });
      });
      frag.appendChild(card);
    }
    body.appendChild(frag);
  }
};
