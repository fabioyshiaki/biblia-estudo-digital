import { events } from './events.js';

const STORAGE_KEY = 'bed_prefs_v2';

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
    sortMode: saved.sortMode || 'favorite',
    activeSetId: saved.activeSetId || 'all',
    editingSetId: null,
    filterType: 'all',
    filterText: '',
    selectedModuleId: null,
    diagnostics: null,
    folders: [],
    modules: [],
    moduleSets: []
  },

  setTheme(theme) {
    this.state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    this.savePrefs();
    events.emit('theme:changed', { theme });
  },

  setSortMode(sortMode) {
    this.state.sortMode = sortMode;
    this.savePrefs();
    events.emit('library:filter-changed');
  },

  setActiveSet(setId) {
    this.state.activeSetId = setId;
    if (this.state.editingSetId && this.state.editingSetId !== setId) {
      this.state.editingSetId = null;
    }
    this.savePrefs();
    events.emit('library:filter-changed');
  },

  setEditingSet(setId) {
    this.state.editingSetId = setId;
    events.emit('library:filter-changed');
  },

  setFilterType(type) {
    this.state.filterType = type;
    events.emit('library:filter-changed');
  },

  setFilterText(text) {
    this.state.filterText = text;
    events.emit('library:filter-changed');
  },

  setSelectedModule(moduleId) {
    this.state.selectedModuleId = moduleId;
    events.emit('library:module-selected', { moduleId });
  },

  getModuleById(id) {
    return this.state.modules.find((m) => m.id === id) || null;
  },

  getSetById(id) {
    return this.state.moduleSets.find((s) => s.id === id) || null;
  },

  savePrefs() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        theme: this.state.theme,
        sortMode: this.state.sortMode,
        activeSetId: this.state.activeSetId
      }));
    } catch {
      // Ignora erro de quota
    }
  }
};
