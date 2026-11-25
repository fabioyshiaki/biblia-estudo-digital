export const webMockDriver = {
  isNative: false,
  checkStoragePermission: async () => ({ granted: true, sdkInt: 33 }),
  requestStoragePermission: async () => ({}),
  getDiagnostics: async () => ({
    deviceModel: 'Web Mock', androidVersion: '13', sdkInt: 33,
    sqliteVersion: '3.32.2', fts5Supported: false,
    maxPoolSize: 14, currentPoolOpen: 0, volumes: []
  }),
  getFolders: async () => ({ folders: [] }),
  saveFolders: async () => {},
  syncCatalog: async () => ({ totalModules: 0, inspected: 0, cachedSkipped: 0, durationMs: 0 }),
  getCatalog: async () => ({ modules: [] }),
  setModuleFavorite: async () => {},
  buildCoverageMap: async () => ({ indexedModules: 0, durationMs: 0 }),
  getCoverageForBook: async () => ({ modules: [] }),
  getModuleSets: async () => ({ sets: [] }),
  saveModuleSet: async () => {},
  deleteModuleSet: async () => {},
  inspectSqliteModule: async ({ path }) => ({ path, openMs: 0, poolOpenCount: 0, tables: [] }),
  queryModule: async () => ({ queryMs: 0, rowCount: 0, rows: [] }),
  readTheWordChapter: async () => ({ queryMs: 0, indexedNow: false, verses: [] }),
  getEpubInfo: async () => ({ title: '', chapterCount: 0, chapters: [], queryMs: 0 }),
  readEpubChapter: async ({ chapterIndex }) => ({ index: chapterIndex, title: '', html: '', chapterCount: 0, queryMs: 0 }),
  getPdfInfo: async () => ({ pageCount: 0, queryMs: 0 }),
  renderPdfPage: async ({ pageIndex }) => ({ pageIndex, pageCount: 0, width: 0, height: 0, dataUrl: '', queryMs: 0 }),
  userDataAction: async ({ action }) => {
    if (action === 'getChapterHighlights') return { highlights: [] };
    if (action === 'getNotes') return { notes: [] };
    if (action === 'getBookmarks') return { bookmarks: [] };
    if (action === 'getClippings') return { clippings: [] };
    if (action === 'getCounts') return { highlights: 0, notes: 0, bookmarks: 0, clippings: 0 };
    if (action === 'exportBackup') return { path: '', counts: { highlights: 0, notes: 0, bookmarks: 0, clippings: 0 }, json: '{}' };
    if (action === 'importBackup') return { imported: { highlights: 0, notes: 0, bookmarks: 0, clippings: 0 } };
    return { ok: true, id: `mock_${Date.now()}` };
  }
};
