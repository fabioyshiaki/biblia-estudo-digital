import { store } from '../core/store.js';
import { events } from '../core/events.js';
import { BOOKS } from '../core/canon.js';
import { catalogRepo } from '../library/catalog-repo.js';

const $ = (id) => document.getElementById(id);

function renderVolumes() {
  const row = $('volume-chips');
  if (!row) return;
  const volumes = (store.state.diagnostics && store.state.diagnostics.volumes) || [];
  row.innerHTML = '';

  for (const vol of volumes) {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = `${vol.isRemovable ? 'microSD' : 'Interno'}: ${vol.path}`;
    btn.addEventListener('click', () => {
      const input = $('input-new-folder');
      input.value = vol.path;
      input.focus();
    });
    row.appendChild(btn);
  }
}

function renderFolders() {
  const container = $('folder-list');
  if (!container) return;
  container.innerHTML = '';

  if (store.state.folders.length === 0) {
    const p = document.createElement('p');
    p.className = 'muted-text';
    p.textContent = 'Nenhuma pasta configurada.';
    container.appendChild(p);
    return;
  }

  for (const folder of store.state.folders) {
    const row = document.createElement('div');
    row.className = 'folder-item';

    const label = document.createElement('label');
    label.className = 'folder-label';

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = Boolean(folder.enabled);
    check.addEventListener('change', () => catalogRepo.toggleFolder(folder.path, check.checked));

    const info = document.createElement('div');
    info.style.minWidth = '0';

    const title = document.createElement('div');
    title.textContent = folder.label || folder.path;

    const sub = document.createElement('span');
    sub.className = 'folder-path';
    sub.textContent = folder.path;

    info.append(title, sub);
    label.append(check, info);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'icon-btn';
    removeBtn.title = 'Remover pasta da lista (não apaga arquivos do disco)';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => catalogRepo.removeFolder(folder.path));

    row.append(label, removeBtn);
    container.appendChild(row);
  }
}

function renderSets() {
  const container = $('set-list');
  if (!container) return;
  container.innerHTML = '';

  const totalCount = store.state.modules.length;
  const favCount = store.state.modules.filter((m) => m.favorite).length;

  const fixedItems = [
    { id: 'all', name: 'Todos os módulos', count: totalCount },
    { id: 'favorites', name: 'Favoritos', count: favCount }
  ];

  for (const item of fixedItems) {
    const row = document.createElement('div');
    row.className = `set-item ${store.state.activeSetId === item.id ? 'active' : ''}`;
    row.innerHTML = `<span>${item.name}</span><span class="module-size">${item.count}</span>`;
    row.addEventListener('click', () => store.setActiveSet(item.id));
    container.appendChild(row);
  }

  for (const set of store.state.moduleSets) {
    const isActive = store.state.activeSetId === set.id;
    const row = document.createElement('div');
    row.className = `set-item ${isActive ? 'active' : ''}`;

    const nameEl = document.createElement('span');
    nameEl.textContent = `${set.name} (${set.moduleIds.length})`;
    nameEl.style.flex = '1';
    nameEl.style.minWidth = '0';
    nameEl.style.overflow = 'hidden';
    nameEl.style.textOverflow = 'ellipsis';
    nameEl.style.whiteSpace = 'nowrap';

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '4px';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn-ghost';
    editBtn.style.padding = '3px 8px';
    editBtn.style.fontSize = '11px';
    editBtn.textContent = store.state.editingSetId === set.id ? 'Editando' : 'Itens';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      store.setActiveSet(set.id);
      store.setEditingSet(store.state.editingSetId === set.id ? null : set.id);
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn';
    delBtn.style.width = '26px';
    delBtn.style.height = '26px';
    delBtn.title = 'Excluir coleção';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      catalogRepo.deleteModuleSet(set.id);
    });

    actions.append(editBtn, delBtn);
    row.append(nameEl, actions);
    row.addEventListener('click', () => store.setActiveSet(set.id));
    container.appendChild(row);
  }
}

function initCoverageBooks() {
  const select = $('select-coverage-book');
  if (!select || select.options.length > 0) return;

  for (const book of BOOKS) {
    const opt = document.createElement('option');
    opt.value = String(book.id);
    opt.textContent = `${book.id <= 66 ? book.testament : 'DC'} · ${book.name} (${book.chapters} cap.)`;
    if (book.id === 45) opt.selected = true; // Romanos como exemplo inicial
    select.appendChild(opt);
  }
}

async function refreshCoveragePreview() {
  const select = $('select-coverage-book');
  const box = $('coverage-result');
  if (!select || !box) return;

  const bookId = Number(select.value || 45);
  try {
    const mods = await catalogRepo.getCoverageForBook(bookId);
    if (mods.length === 0) {
      box.textContent = 'Nenhum módulo mapeado para este livro ainda. Toque em "Mapear Livros".';
      return;
    }
    const bibles = mods.filter((m) => m.type === 'bible');
    const comments = mods.filter((m) => m.type === 'commentary');
    const previewNames = comments.slice(0, 12).map((m) => m.abbr || m.title).join(', ');
    box.textContent =
      `Cobertura instantânea: ${bibles.length} Bíblia(s) · ${comments.length} Comentário(s).` +
      (previewNames ? `\nComentários: ${previewNames}${comments.length > 12 ? '...' : ''}` : '');
  } catch (err) {
    box.textContent = `Erro ao consultar cobertura: ${err.message || err}`;
  }
}

async function runSync(force) {
  const status = $('sync-status');
  const btnSync = $('btn-sync-catalog');
  const btnForce = $('btn-force-sync');

  btnSync.disabled = true;
  btnForce.disabled = true;
  status.textContent = force
    ? 'Reindexando cabeçalhos de todos os módulos...'
    : 'Sincronizando pastas da biblioteca...';

  try {
    const stats = await catalogRepo.syncCatalog(force);
    status.textContent =
      `${stats.totalModules} módulos no catálogo (${stats.inspected} lidos, ${stats.cachedSkipped} em cache) em ${stats.durationMs} ms.`;
  } catch (err) {
    status.textContent = `Erro na sincronização: ${err.message || err}`;
  } finally {
    btnSync.disabled = false;
    btnForce.disabled = false;
  }
}

async function runBuildCoverage() {
  const status = $('coverage-status');
  const btn = $('btn-build-coverage');
  btn.disabled = true;
  status.textContent = 'Mapeando cobertura de Bíblias e comentários em segundo plano...';

  try {
    const stats = await catalogRepo.buildCoverageMap();
    status.textContent = `${stats.indexedModules} módulo(s) mapeado(s) em ${stats.durationMs} ms.`;
    await refreshCoveragePreview();
  } catch (err) {
    status.textContent = `Falha no mapeamento: ${err.message || err}`;
  } finally {
    btn.disabled = false;
  }
}

export const foldersPanel = {
  init() {
    initCoverageBooks();

    $('btn-add-folder').addEventListener('click', async () => {
      const input = $('input-new-folder');
      const added = await catalogRepo.addFolder(input.value);
      if (added) {
        input.value = '';
        $('sync-status').textContent = 'Pasta adicionada. Toque em "Sincronizar Biblioteca".';
      }
    });

    $('btn-sync-catalog').addEventListener('click', () => runSync(false));$('btn-force-sync').addEventListener('click', () => runSync(true));

    const createSet = async () => {
      const input = $('input-new-set');
      const created = await catalogRepo.createModuleSet(input.value);
      if (created) input.value = '';
    };
    $('btn-create-set').addEventListener('click', createSet);$('input-new-set').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') createSet();
    });

    $('btn-build-coverage').addEventListener('click', runBuildCoverage);$('select-coverage-book').addEventListener('change', refreshCoveragePreview);

    events.on('folders:updated', renderFolders);
    events.on('sets:updated', renderSets);
    events.on('catalog:updated', () => {
      renderFolders();
      renderSets();
      refreshCoveragePreview();
    });
    events.on('library:filter-changed', renderSets);
  },

  renderVolumes,
  runSync
};
