import { engineApi } from '../bridge/engine-api.js';
import { store } from '../core/store.js';
import { events } from '../core/events.js';

function parseSets(rawSets) {
  return (rawSets || []).map((s) => {
    let ids = [];
    try {
      ids = JSON.parse(s.moduleIdsJson || '[]');
    } catch {
      ids = [];
    }
    return {
      id: s.id,
      name: s.name,
      moduleIds: Array.isArray(ids) ? ids : [],
      sortOrder: s.sortOrder || 0
    };
  });
}

export const catalogRepo = {
  async loadInitial() {
    const [folderRes, catRes, setsRes] = await Promise.all([
      engineApi.getFolders(),
      engineApi.getCatalog(),
      engineApi.getModuleSets()
    ]);

    let folders = folderRes.folders || [];
    if (folders.length === 0) {
      folders = [{
        path: '/storage/emulated/0/mysword',
        label: 'MySword (Interno)',
        enabled: true,
        addedAt: Date.now()
      }];
      await engineApi.saveFolders(folders);
    }

    store.state.folders = folders;
    store.state.modules = catRes.modules || [];
    store.state.moduleSets = parseSets(setsRes.sets);

    if (
      store.state.activeSetId !== 'all' &&
      store.state.activeSetId !== 'favorites' &&
      !store.getSetById(store.state.activeSetId)
    ) {
      store.state.activeSetId = 'all';
    }

    events.emit('catalog:updated');
  },

  async addFolder(path, label) {
    const clean = String(path || '').trim().replace(/\/+$/, '');
    if (!clean) return false;
    if (store.state.folders.some((f) => f.path === clean)) return false;

    const next = [
      ...store.state.folders,
      { path: clean, label: label || clean.split('/').pop() || clean, enabled: true, addedAt: Date.now() }
    ];
    await engineApi.saveFolders(next);
    store.state.folders = next;
    events.emit('folders:updated');
    return true;
  },

  async toggleFolder(path, enabled) {
    const next = store.state.folders.map((f) => (f.path === path ? { ...f, enabled } : f));
    await engineApi.saveFolders(next);
    store.state.folders = next;
    events.emit('folders:updated');
  },

  async removeFolder(path) {
    const next = store.state.folders.filter((f) => f.path !== path);
    await engineApi.saveFolders(next);
    store.state.folders = next;
    events.emit('folders:updated');
  },

  async syncCatalog(force = false) {
    const stats = await engineApi.syncCatalog(force);
    const catRes = await engineApi.getCatalog();
    store.state.modules = catRes.modules || [];
    events.emit('library:scanned', {
      totalModules: stats.totalModules,
      durationMs: stats.durationMs
    });
    events.emit('catalog:updated');
    return stats;
  },

  async toggleFavorite(moduleId) {
    const mod = store.getModuleById(moduleId);
    if (!mod) return;
    const nextFav = !mod.favorite;
    mod.favorite = nextFav;
    await engineApi.setModuleFavorite(moduleId, nextFav);
    events.emit('catalog:updated');
  },

  async buildCoverageMap() {
    const stats = await engineApi.buildCoverageMap();
    const catRes = await engineApi.getCatalog();
    store.state.modules = catRes.modules || [];
    events.emit('catalog:updated');
    return stats;
  },

  async getCoverageForBook(bookId, type = '') {
    const res = await engineApi.getCoverageForBook(bookId, type);
    return res.modules || [];
  },

  async createModuleSet(name) {
    const clean = String(name || '').trim();
    if (!clean) return null;
    const id = `set_${Date.now().toString(36)}`;
    const sortOrder = store.state.moduleSets.length;
    await engineApi.saveModuleSet(id, clean, [], sortOrder);
    const newSet = { id, name: clean, moduleIds: [], sortOrder };
    store.state.moduleSets = [...store.state.moduleSets, newSet];
    store.setActiveSet(id);
    store.setEditingSet(id);
    events.emit('sets:updated');
    return newSet;
  },

  async toggleModuleInSet(setId, moduleId) {
    const set = store.getSetById(setId);
    if (!set) return;
    const exists = set.moduleIds.includes(moduleId);
    const nextIds = exists
      ? set.moduleIds.filter((id) => id !== moduleId)
      : [...set.moduleIds, moduleId];
    set.moduleIds = nextIds;
    await engineApi.saveModuleSet(set.id, set.name, nextIds, set.sortOrder);
    events.emit('sets:updated');
    events.emit('library:filter-changed');
  },

  async deleteModuleSet(setId) {
    await engineApi.deleteModuleSet(setId);
    store.state.moduleSets = store.state.moduleSets.filter((s) => s.id !== setId);
    if (store.state.activeSetId === setId) {
      store.setActiveSet('all');
    }
    events.emit('sets:updated');
  }
};
