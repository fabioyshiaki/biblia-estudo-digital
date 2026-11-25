import { store } from '../core/store.js';
import { events } from '../core/events.js';
import { catalogRepo } from '../library/catalog-repo.js';
import { engineApi } from '../bridge/engine-api.js';
import { moduleReader } from '../formats/module-reader.js';
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

function canOpenInReader(mod) {
  if (!mod || mod.locked || !moduleReader.isSupported(mod)) return false;
  return ['bible', 'commentary', 'dictionary', 'book'].includes(mod.type);
}

function openModuleInReader(mod) {
  if (!canOpenInReader(mod)) return;

  if (mod.type === 'bible') {
    store.setActiveModule('bible', mod.id);
    store.setViewMode('reader');
    return;
  }

  if (mod.type === 'commentary') {
    store.setActiveModule('commentary', mod.id);
    store.setStudyTab('commentary');
    store.setViewMode('reader');
    return;
  }

  if (mod.type === 'dictionary') {
    store.setActiveModule('dictionary', mod.id);
    store.setStudyTab('dictionary');
    store.setViewMode('reader');
    return;
  }

  if (mod.type === 'book') {
    store.setActiveModule('book', mod.id);
    store.setStudyTab('book');
    store.setViewMode('reader');
  }
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
    if (mode === 'favorite' && a.favorite !==
