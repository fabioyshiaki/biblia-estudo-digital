import { store } from './store.js';
import { engineApi } from '../bridge/engine-api.js';
import { catalogRepo } from '../library/catalog-repo.js';
import { foldersPanel } from '../ui/folders-panel.js';
import { libraryView } from '../ui/library-view.js';

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
    ? 'Onda 1 · Catálogo UFS 3.1 + 120 Hz'
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
  initSidebarToggle();

  $('btn-grant-perm').addEventListener('click', () => engineApi.requestStoragePermission());

  foldersPanel.init();
  libraryView.init();

  await catalogRepo.loadInitial();

  // Em retrato no Y700, inicia recolhido se já houver módulos no catálogo
  if (window.innerWidth < 760 && store.state.modules.length > 0) {
    const sidebar = $('sidebar-pane');
    if (sidebar) sidebar.classList.add('collapsed');
  }

  await refreshSystemStatus();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshSystemStatus();
    }
  });
}

bootstrap();
