import { store } from '../core/store.js';
import { events } from '../core/events.js';
import { catalogRepo } from '../library/catalog-repo.js';
import { engineApi } from '../bridge/engine-api.js';
import { VirtualList } from './virtual-list.js';

const $ = (id) => document.getElementById(id);

const TYPE_LABELS = {
  all: 'Todos',
  bible: 'Bíblias',
  commentary: 'Comentários',
  dictionary: 'Dicionários',
  book: 'Livros',
  devotional: 'Devocionais',
  map: 'Mapas',
  document: 'PDFs',
  reference: 'Referências'
};

let vlist = null;
let inspectToken = 0;

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(i >= 2 ? 1 : 0)} ${units[i]}`;
}

function norm(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getScopeModules() {
  const { modules, activeSetId, editingSetId } = store.state;
  if (editingSetId) return modules;
  if (activeSetId === 'all') return modules;
  if (activeSetId === 'favorites') return modules.filter((m) => m.favorite);

  const set = store.getSetById(activeSetId);
  if (!set) return modules;
  const idSet = new Set(set.moduleIds);
  return modules.filter((m) => idSet.has(m.id));
}

function getFilteredModules() {
  const scoped = getScopeModules();
  const q = norm(store.state.filterText.trim());
  const typeFilter = store.state.filterType;

  const byText = q
    ? scoped.filter((m) => {
        const hay = norm(`${m.title} ${m.abbr} ${m.fileName} ${m.lang} ${m.format} ${m.type}`);
        return hay.includes(q);
      })
    : scoped;

  const counts = { all: byText.length };
  for (const m of byText) {
    counts[m.type] = (counts[m.type] || 0) + 1;
  }

  let list = typeFilter === 'all' ? byText : byText.filter((m) => m.type === typeFilter);
  const mode = store.state.sortMode;

  list = [...list].sort((a, b) => {
    if (mode === 'size') return (b.sizeBytes || 0) - (a.sizeBytes || 0);
    if (mode === 'favorite' && a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return (a.title || a.fileName).localeCompare(b.title || b.fileName, 'pt-BR');
  });

  return { list, counts, totalCatalog: store.state.modules.length };
}

function renderSetBanner() {
  const banner = $('set-edit-banner');
  const label = $('set-edit-label');
  const btn = $('btn-toggle-set-edit');
  const { activeSetId, editingSetId } = store.state;

  const targetId = editingSetId || (activeSetId !== 'all' && activeSetId !== 'favorites' ? activeSetId : null);
  const set = targetId ? store.getSetById(targetId) : null;

  if (!set) {
    banner.classList.add('hidden');
    return;
  }

  banner.classList.remove('hidden');
  if (editingSetId) {
    label.textContent = `Editando "${set.name}" (${set.moduleIds.length} itens) — toque em + para incluir ou ✓ para remover.`;
    btn.textContent = 'Concluir edição';
  } else {
    label.textContent = `Coleção ativa: "${set.name}" (${set.moduleIds.length} módulos).`;
    btn.textContent = 'Editar itens';
  }
}

function renderTypeChips(counts) {
  const row = $('type-chips');
  row.innerHTML = '';
  const order = ['all', 'bible', 'commentary', 'dictionary', 'book', 'devotional', 'map', 'document', 'reference'];

  for (const type of order) {
    const count = counts[type] || 0;
    if (type !== 'all' && count === 0) continue;

    const btn = document.createElement('button');
    btn.className = `chip ${store.state.filterType === type ? 'active' : ''}`;
    btn.textContent = `${TYPE_LABELS[type] || type} (${count})`;
    btn.addEventListener('click', () => store.setFilterType(type));
    row.appendChild(btn);
  }
}

function renderRow(mod) {
  const editingSet = store.state.editingSetId ? store.getSetById(store.state.editingSetId) : null;
  const isInSet = editingSet ? editingSet.moduleIds.includes(mod.id) : false;

  const row = document.createElement('div');
  row.className = `vrow ${store.state.selectedModuleId === mod.id ? 'selected' : ''}`;

  const main = document.createElement('div');
  main.className = 'vrow-main';

  const titleLine = document.createElement('div');
  titleLine.className = 'vrow-title-line';

  const abbr = document.createElement('span');
  abbr.className = 'vrow-abbr';
  abbr.textContent = mod.abbr || mod.format.toUpperCase();

  const title = document.createElement('span');
  title.className = 'vrow-title';
  title.textContent = mod.title || mod.fileName;

  titleLine.append(abbr, title);

  const sub = document.createElement('div');
  sub.className = 'vrow-sub';
  const langTag = mod.lang ? ` · ${mod.lang.toUpperCase()}` : '';
  sub.append(document.createTextNode(`${mod.format.toUpperCase()} · ${TYPE_LABELS[mod.type] || mod.type}${langTag}`));

  if (mod.hasStrong) addPill(sub, 'Strong');
  if (mod.hasMorph) addPill(sub, 'Morf');
  if (mod.rtl) addPill(sub, 'RTL');
  if (mod.coverageReady) addPill(sub, 'Mapeado', 'ok');
  if (mod.locked) addPill(sub, 'Bloqueado', 'warn');

  main.append(titleLine, sub);

  const actions = document.createElement('div');
  actions.className = 'vrow-actions';

  const size = document.createElement('span');
  size.className = 'module-size';
  size.textContent = formatBytes(mod.sizeBytes);

  const actionBtn = document.createElement('button');
  if (editingSet) {
    actionBtn.className = `icon-btn ${isInSet ? 'in-set' : ''}`;
    actionBtn.textContent = isInSet ? '✓' : '+';
    actionBtn.title = isInSet ? 'Remover da coleção' : 'Adicionar à coleção';
    actionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      catalogRepo.toggleModuleInSet(editingSet.id, mod.id);
    });
  } else {
    actionBtn.className = `icon-btn ${mod.favorite ? 'fav-active' : ''}`;
    actionBtn.textContent = mod.favorite ? '★' : '☆';
    actionBtn.title = mod.favorite ? 'Remover dos favoritos' : 'Marcar como favorito';
    actionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      catalogRepo.toggleFavorite(mod.id);
    });
  }

  actions.append(size, actionBtn);
  row.append(main, actions);
  row.addEventListener('click', () => selectAndInspect(mod));
  return row;
}

function addPill(parent, text, tone = '') {
  const span = document.createElement('span');
  span.className = `tag-pill ${tone}`;
  span.textContent = text;
  parent.appendChild(span);
}

async function selectAndInspect(mod) {
  store.setSelectedModule(mod.id);
  vlist.refreshVisible();

  const bar = $('inspector-bar');
  const token = ++inspectToken;

  const renderBar = (techLine) => {
    bar.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'inspector-head';

    const title = document.createElement('div');
    title.className = 'inspector-title';
    title.textContent = `${mod.title} (${mod.abbr})`;

    const meta = document.createElement('span');
    meta.className = 'module-size';
    meta.textContent = `${mod.format.toUpperCase()} · ${formatBytes(mod.sizeBytes)}`;

    head.append(title, meta);

    const tech = document.createElement('div');
    tech.className = 'inspector-tech';
    tech.textContent = techLine;

    bar.append(head, tech);
  };

  if (!mod.isSqlite) {
    renderBar(
      `Arquivo: ${mod.path}\nTipo: ${TYPE_LABELS[mod.type] || mod.type} (leitor dedicado entra na Onda 2).`
    );
    return;
  }

  renderBar(`Abrindo ${mod.fileName} direto do disco...`);
  try {
    const res = await engineApi.inspectSqliteModule(mod.path);
    if (token !== inspectToken) return;
    renderBar(
      `Abertura direta: ${res.openMs} ms · Pool LRU: ${res.poolOpenCount}/14 · Tabelas: ${res.tables.join(', ')}\n` +
      `Caminho: ${mod.path}`
    );
  } catch (err) {
    if (token !== inspectToken) return;
    renderBar(`Erro ao abrir módulo: ${err.message || err}\nCaminho: ${mod.path}`);
  }
}

function refreshList({ resetScroll = false } = {}) {
  const { list, counts, totalCatalog } = getFilteredModules();
  const totalBytes = list.reduce((acc, m) => acc + (m.sizeBytes || 0), 0);

  $('lib-count-badge').textContent =
    `Exibindo ${list.length} de ${totalCatalog} módulos (${formatBytes(totalBytes)})`;

  renderSetBanner();
  renderTypeChips(counts);
  vlist.setItems(list, { resetScroll });
}

export const libraryView = {
  init() {
    vlist = new VirtualList($('virtual-module-list'), {
      itemHeight: 72,
      overscan: 8,
      renderItem: renderRow,
      emptyText: 'Nenhum módulo encontrado. Sincronize suas pastas na barra lateral.'
    });

    $('select-sort-lib').value = store.state.sortMode;
    $('select-sort-lib').addEventListener('change', (e) => store.setSortMode(e.target.value));
    $('input-search-lib').addEventListener('input', (e) => store.setFilterText(e.target.value));

    $('btn-toggle-set-edit').addEventListener('click', () => {
      if (store.state.editingSetId) {
        store.setEditingSet(null);
      } else if (store.state.activeSetId !== 'all' && store.state.activeSetId !== 'favorites') {
        store.setEditingSet(store.state.activeSetId);
      }
    });

    events.on('catalog:updated', () => refreshList({ resetScroll: false }));
    events.on('library:filter-changed', () => refreshList({ resetScroll: true }));
    events.on('sets:updated', () => refreshList({ resetScroll: false }));
  }
};
