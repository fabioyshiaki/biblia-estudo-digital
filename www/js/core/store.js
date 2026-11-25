import { events } from './events.js';

const STORAGE_KEY = 'bed_prefs_v3';

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
    viewMode: saved.viewMode || 'library',
    sortMode: saved.sortMode || 'favorite',
    activeSetId: saved.activeSetId || 'all',
    editingSetId: null,
    filterType: 'all',
    filterText: '',
    selectedModuleId: null,
    diagnostics: null,
    folders: [],
    modules: [],
    moduleSets: [],

    // Estado do Leitor Editorial e Painel de Estudo
    currentBcv: saved.currentBcv || { bookId: 43, chapter: 3, verse: 16 },
    activeBibleId: saved.activeBibleId || null,
    activeCommentaryId: saved.activeCommentaryId || null,
    activeDictId: saved.activeDictId || null,
    activeBookId: saved.activeBookId || null,
    studyPaneOpen: saved.studyPaneOpen !== false,
    studyTab: saved.studyTab || 'resource-guide',
    fontSize: saved.fontSize || 19,
    showStrongs: saved.showStrongs !== false,
    navHistory: [],
    navIndex: -1
  },

  setTheme(theme) {
    this.state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    this.savePrefs();
    events.emit('theme:changed', { theme });
  },

  setViewMode(viewMode) {
    this.state.viewMode = viewMode;
    this.savePrefs();
    events.emit('view:changed', { viewMode });
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

  setCurrentBcv(bcv, { recordHistory = true } = {}) {
    const next = {
      bookId: Number(bcv.bookId || 43),
      chapter: Number(bcv.chapter || 1),
      verse: bcv.verse ? Number(bcv.verse) : (bcv.verseStart ? Number(bcv.verseStart) : 1)
    };
    if (recordHistory) {
      const prev = this.state.navHistory[this.state.navIndex];
      const changed = !prev || prev.bookId !== next.bookId || prev.chapter !== next.chapter || prev.verse !== next.verse;
      if (changed) {
        this.state.navHistory = this.state.navHistory.slice(0, this.state.navIndex + 1);
        this.state.navHistory.push(next);
        if (this.state.navHistory.length > 60) this.state.navHistory.shift();
        this.state.navIndex = this.state.navHistory.length - 1;
      }
    }
    this.state.currentBcv = next;
    this.savePrefs();
    events.emit('nav:goto', { bcv: next, linkSet: 'A' });
  },

  goBack() {
    if (this.state.navIndex <= 0) return false;
    this.state.navIndex -= 1;
    this.setCurrentBcv(this.state.navHistory[this.state.navIndex], { recordHistory: false });
    return true;
  },

  goForward() {
    if (this.state.navIndex >= this.state.navHistory.length - 1) return false;
    this.state.navIndex += 1;
    this.setCurrentBcv(this.state.navHistory[this.state.navIndex], { recordHistory: false });
    return true;
  },

  setActiveModule(slot, moduleId) {
    const map = {
      bible: 'activeBibleId',
      commentary: 'activeCommentaryId',
      dictionary: 'activeDictId',
      book: 'activeBookId'
    };
    const key = map[slot];
    if (!key) return;
    this.state[key] = moduleId;
    this.savePrefs();
    events.emit('reader:module-changed', { slot, moduleId });
  },

  setStudyPaneOpen(open) {
    this.state.studyPaneOpen = Boolean(open);
    this.savePrefs();
    events.emit('study:changed', { open: this.state.studyPaneOpen, tab: this.state.studyTab });
  },

  setStudyTab(tab) {
    this.state.studyTab = tab;
    this.state.studyPaneOpen = true;
    this.savePrefs();
    events.emit('study:changed', { open: true, tab });
  },

  setFontSize(px) {
    const clamped = Math.min(30, Math.max(14, Number(px) || 19));
    this.state.fontSize = clamped;
    document.documentElement.style.setProperty('--reader-font-size', `${clamped}px`);
    this.savePrefs();
  },

  toggleStrongs() {
    this.state.showStrongs = !this.state.showStrongs;
    this.savePrefs();
    events.emit('reader:prefs-changed');
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
        viewMode: this.state.viewMode,
        sortMode: this.state.sortMode,
        activeSetId: this.state.activeSetId,
        currentBcv: this.state.currentBcv,
        activeBibleId: this.state.activeBibleId,
        activeCommentaryId: this.state.activeCommentaryId,
        activeDictId: this.state.activeDictId,
        activeBookId: this.state.activeBookId,
        studyPaneOpen: this.state.studyPaneOpen,
        studyTab: this.state.studyTab,
        fontSize: this.state.fontSize,
        showStrongs: this.state.showStrongs
      }));
    } catch {
      // Ignora erro de quota
    }
  }
};
