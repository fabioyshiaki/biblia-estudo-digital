import { store } from './store.js';
import { events } from './events.js';
import { engineApi } from '../bridge/engine-api.js';
import { catalogRepo } from '../library/catalog-repo.js';
import { foldersPanel } from '../ui/folders-panel.js';
import { libraryView } from '../ui/library-view.js';
import { navSelector } from '../ui/nav-selector.js';
import { instantDetails } from '../ui/instant-details.js';
import { readerView } from '../ui/reader-view.js';
import { studyPanel } from '../ui/study-panel.js';

const $ = (id) => document.getElementById(id);
let initialAutoSynced = false;

function initThemes() {
  const updateButtons = (theme) => {
    document.querySelectorAll('.theme-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.themeSet === theme);
    });
  };

  store.setTheme(store.state.theme);
  updateButtons(store.state.theme);

  document.querySelectorAll('.theme-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.setTheme(btn.dataset.themeSet);
      updateButtons(btn.dataset.themeSet);
    });
  });
}

function applyViewMode(viewMode) {
  const isReader = viewMode === 'reader';
  $('view-reader').classList.toggle('hidden', !isReader);
  $('view-library').classList.toggle('hidden', isReader);

  const sidebarBtn = $('btn-toggle-sidebar');
  if (sidebarBtn) sidebarBtn.classList.toggle('hidden', isReader);

  document.querySelectorAll('.view-tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.viewSet === viewMode);
  });
}

function initViewTabs() {
  document.querySelectorAll('.view-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => store.setViewMode(btn.dataset.viewSet));
  });
  events.on('view:changed', ({ viewMode }) => applyViewMode(viewMode));
}

function initSidebarToggle() {
  const sidebar = $('sidebar-pane');
  const btn = $('btn-toggle-sidebar');
  if (!sidebar || !btn) return;

  btn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
  });
}

async function refreshSystemStatus() {
  const perm = await engineApi.checkStoragePermission();
  const statusEl = $('perm-status');
  const grantBtn = $('btn-grant-perm');

  if (perm.granted) {
    statusEl.textContent = 'Acesso total concedido (UFS 3.1 + microSD).';
    statusEl.className = 'ok-text';
    grantBtn.classList.add('hidden');
  } else {
    statusEl.textContent = 'Permissão pendente para ler suas pastas.';
    statusEl.className = 'warn-text';
    grantBtn.classList.remove('hidden');
  }

  const diag = await engineApi.getDiagnostics();
  store.state.diagnostics = diag;
  foldersPanel.renderVolumes();

  $('env-badge').textContent = engineApi.isNative
    ? 'Onda 1 · Leitor Editorial Y700'
    : 'Onda 1 · Modo Navegador (Simulação)';

  $('diag-line').textContent =
    `${diag.deviceModel} · Android ${diag.androidVersion} · SQLite ${diag.sqliteVersion} · ` +
    `FTS5: ${diag.fts5Supported ? 'Ativo' : 'Pendente (sqlite-android)'}`;

  if (perm.granted && !initialAutoSynced && store.state.modules.length === 0) {
    initialAutoSynced = true;
    await foldersPanel.runSync(false);
  }
}

async function bootstrap() {
  initThemes();
  initViewTabs();
  initSidebarToggle();

  $('btn-grant-perm').addEventListener('click', () => engineApi.requestStoragePermission());

  foldersPanel.init();
  libraryView.init();
  navSelector.init();
  instantDetails.init();
  readerView.init();
  studyPanel.init();

  // Inicializa o histórico de navegação com a referência inicial
  if (store.state.navHistory.length === 0) {
    store.state.navHistory = [{ ...store.state.currentBcv }];
    store.state.navIndex = 0;
  }

  await catalogRepo.loadInitial();

  // Em retrato no Y700, recolhe a barra lateral da biblioteca quando já há módulos
  if (window.innerWidth < 760 && store.state.modules.length > 0) {
    const sidebar = $('sidebar-pane');
    if (sidebar) sidebar.classList.add('collapsed');
  }

  const startView = store.state.modules.length > 0 ? store.state.viewMode : 'library';
  applyViewMode(startView);
  if (startView === 'reader') {
    events.emit('view:changed', { viewMode: 'reader' });
  }

  await refreshSystemStatus();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshSystemStatus();
    }
  });
}

bootstrap();
