import { events } from './events.js';

const STORAGE_KEY = 'bed_prefs_v1';

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

const saved = loadPrefs();

export const store = {
  state: {
    theme: saved.theme || 'charcoal',
    folderPath: saved.folderPath || '/storage/emulated/0/mysword',
    diagnostics: null,
    files: [],
    filterText: '',
    filterFormat: 'all',
    sortBySize: true
  },

  setTheme(theme) {
    this.state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    this.savePrefs();
    events.emit('theme:changed', { theme });
  },

  setFolderPath(folderPath) {
    this.state.folderPath = folderPath;
    this.savePrefs();
  },

  setFiles(files, durationMs) {
    this.state.files = files;
    events.emit('library:scanned', { totalModules: files.length, durationMs });
  },

  savePrefs() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        theme: this.state.theme,
        folderPath: this.state.folderPath
      }));
    } catch {
      // Ignora erro de quota
    }
  }
};
