import { store } from './store.js';
import { engineApi } from '../bridge/engine-api.js';

const $ = (id) => document.getElementById(id);
const MAX_RENDERED_ITEMS = 250;

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let idx = 0;
  let value = bytes;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx++;
  }
  return `${value.toFixed(idx >= 2 ? 1 : 0)} ${units[idx]}`;
}

function initThemeControls() {
  const applyActive = (theme) => {
    document.querySelectorAll('.theme-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.themeSet === theme);
    });
  };

  store.setTheme(store.state.theme);
  applyActive(store.state.theme);

  document.querySelectorAll('.theme-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.setTheme(btn.dataset.themeSet);
      applyActive(btn.dataset.themeSet);
    });
  });
}

async function refreshDiagnostics() {
  const perm = await engineApi.checkStoragePermission();
  const permStatus = $('perm-status');
  const btnGrant = $('btn-grant-perm');

  if (perm.granted) {
    permStatus.textContent = 'Acesso total a arquivos concedido (leitura direta sem cópia).';
    permStatus.className = 'ok-text';
    btnGrant.classList.add('hidden');
  } else {
    permStatus.textContent = 'Permissão necessária para ler sua pasta de módulos/microSD.';
    permStatus.className = 'warn-text';
    btnGrant.classList.remove('hidden');
  }

  const diag = await engineApi.getDiagnostics();
  store.state.diagnostics = diag;

  $('env-badge').textContent = engineApi.isNative
    ? 'Onda 0 · Motor Nativo Android'
    : 'Onda 0 · Modo Navegador (Simulação)';

  const items = [
    ['Dispositivo', diag.deviceModel],
    ['Android / SDK', `${diag.androidVersion} (API ${diag.sdkInt})`],
    ['SQLite Nativo', diag.sqliteVersion],
    ['Suporte FTS5', diag.fts5Supported ? 'Sim (Ativo)' : 'Não (usaremos sqlite-android)'],
    ['Pool LRU SQLite', `${diag.currentPoolOpen} / ${diag.maxPoolSize} abertos`],
    ['Volumes', `${(diag.volumes || []).length} detectado(s)`]
  ];

  const grid = $('diag-grid');
  grid.innerHTML = '';
  for (const [label, value] of items) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    if (label === 'Suporte FTS5') {
      dd.className = diag.fts5Supported ? 'ok-text' : 'warn-text';
    }
    grid.append(dt, dd);
  }

  renderVolumeChips(diag.volumes || []);
}

function renderVolumeChips(volumes) {
  const row = $('volume-chips');
  row.innerHTML = '';
  for (const vol of volumes) {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = `${vol.isRemovable ? 'microSD' : 'Interno'}: ${vol.path}`;
    btn.addEventListener('click', () => {
      $('input-folder').value = vol.path;
      store.setFolderPath(vol.path);
    });
    row.appendChild(btn);
  }
}

async function runScan() {
  const path = $('input-folder').value.trim();
  if (!path) return;
  store.setFolderPath(path);

  const summary = $('scan-summary');
  summary.textContent = `Escaneando ${path}...`;

  try {
    const res = await engineApi.scanDirectory(path);
    store.setFiles(res.files || [], res.durationMs);
    const totalBytes = res.files.reduce((acc, f) => acc + (f.sizeBytes || 0), 0);
    summary.textContent =
      `${res.total} módulos encontrados (${formatBytes(totalBytes)}) em ${res.durationMs} ms.`;
    renderFormatChips();
    renderModuleList();
  } catch (err) {
    summary.textContent = `Erro ao escanear: ${err.message || err}`;
  }
}

function renderFormatChips() {
  const counts = {};
  for (const f of store.state.files) {
    counts[f.format] = (counts[f.format] || 0) + 1;
  }

  const row = $('format-counts');
  row.innerHTML = '';
  const entries = [['all', store.state.files.length], ...Object.entries(counts)];

  for (const [fmt, count] of entries) {
    const btn = document.createElement('button');
    btn.className = `chip ${store.state.filterFormat === fmt ? 'active' : ''}`;
    btn.textContent = fmt === 'all' ? `Todos (${count})` : `${fmt.toUpperCase()} (${count})`;
    btn.addEventListener('click', () => {
      store.state.filterFormat = fmt;
      renderFormatChips();
      renderModuleList();
    });
    row.appendChild(btn);
  }
}

function renderModuleList() {
  const container = $('module-list');
  const q = store.state.filterText.toLowerCase();
  const fmt = store.state.filterFormat;

  let list = store.state.files.filter((f) => {
    if (fmt !== 'all' && f.format !== fmt) return false;
    if (q && !f.name.toLowerCase().includes(q) && !f.format.includes(q) && !f.type.includes(q)) {
      return false;
    }
    return true;
  });

  if (store.state.sortBySize) {
    list = [...list].sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0));
  } else {
    list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  }

  container.innerHTML = '';
  if (list.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty-state';
    p.textContent = 'Nenhum módulo corresponde ao filtro.';
    container.appendChild(p);
    return;
  }

  const frag = document.createDocumentFragment();
  const visible = list.slice(0, MAX_RENDERED_ITEMS);

  for (const mod of visible) {
    const row = document.createElement('div');
    row.className = 'module-row';

    const left = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'module-name';
    name.textContent = mod.name;

    const sub = document.createElement('div');
    sub.className = 'module-sub';
    sub.textContent = `${mod.format.toUpperCase()} · ${mod.type}${mod.isSqlite ? ' · SQLite' : ''}`;

    left.append(name, sub);

    const size = document.createElement('div');
    size.className = 'module-size';
    size.textContent = formatBytes(mod.sizeBytes);

    row.append(left, size);
    row.addEventListener('click', () => inspectModule(mod));
    frag.appendChild(row);
  }

  if (list.length > MAX_RENDERED_ITEMS) {
    const note = document.createElement('p');
    note.className = 'muted-text';
    note.textContent = `Exibindo ${MAX_RENDERED_ITEMS} de ${list.length} módulos. Use o filtro para localizar outros (lista virtualizada completa entra na Onda 1).`;
    frag.appendChild(note);
  }

  container.appendChild(frag);
}

async function inspectModule(mod) {
  const box = $('inspect-box');
  if (!mod.isSqlite) {
    box.textContent =
      `Arquivo: ${mod.name}\nFormato: ${mod.format.toUpperCase()} (${formatBytes(mod.sizeBytes)})\n` +
      `Caminho: ${mod.path}\nNota: Leitura paginada (.ont / EPUB / PDF) entra na Onda 2.`;
    return;
  }

  box.textContent = `Abrindo ${mod.name} (${formatBytes(mod.sizeBytes)})...`;
  try {
    const res = await engineApi.inspectSqliteModule(mod.path);
    box.textContent =
      `Arquivo: ${mod.name} (${formatBytes(mod.sizeBytes)})\n` +
      `Tempo de abertura direta: ${res.openMs} ms (zero cópia)\n` +
      `Conexões no Pool LRU: ${res.poolOpenCount} / 14\n` +
      `Tabelas SQLite (${res.tables.length}): ${res.tables.join(', ')}`;
  } catch (err) {
    box.textContent = `Falha ao abrir ${mod.name}:\n${err.message || err}`;
  }
}

function bindEvents() {
  $('input-folder').value = store.state.folderPath;

  $('btn-refresh-diag').addEventListener('click', refreshDiagnostics);
  $('btn-grant-perm').addEventListener('click', () => engineApi.requestStoragePermission());
  $('btn-scan').addEventListener('click', runScan);

  $('input-filter').addEventListener('input', (e) => {
    store.state.filterText = e.target.value;
    renderModuleList();
  });

  $('btn-sort-size').addEventListener('click', () => {
    store.state.sortBySize = !store.state.sortBySize;
    $('btn-sort-size').textContent = store.state.sortBySize ? 'Maiores primeiro' : 'Ordem A–Z';
    renderModuleList();
  });

  // Revalida permissão automaticamente ao voltar das Configurações do Android
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshDiagnostics();
    }
  });
}

initThemeControls();
bindEvents();
refreshDiagnostics();
