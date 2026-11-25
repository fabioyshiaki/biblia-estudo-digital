import { webMockDriver } from './driver-web-mock.js';

function getNativePlugin() {
  const cap = window.Capacitor;
  if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
    return cap.Plugins && cap.Plugins.BibleEngine ? cap.Plugins.BibleEngine : null;
  }
  return null;
}

const native = getNativePlugin();
const target = native || webMockDriver;

export const engineApi = {
  isNative: Boolean(native),
  checkStoragePermission: () => target.checkStoragePermission(),
  requestStoragePermission: () => target.requestStoragePermission(),
  getDiagnostics: () => target.getDiagnostics(),
  getFolders: () => target.getFolders(),
  saveFolders: (folders) => target.saveFolders({ folders }),
  syncCatalog: (force = false) => target.syncCatalog({ force }),
  getCatalog: () => target.getCatalog(),
  setModuleFavorite: (id, favorite) => target.setModuleFavorite({ id, favorite }),
  buildCoverageMap: () => target.buildCoverageMap(),
  getCoverageForBook: (bookId, type = '') => target.getCoverageForBook({ bookId, type }),
  getModuleSets: () => target.getModuleSets(),
  saveModuleSet: (id, name, moduleIds, sortOrder = 0) =>
    target.saveModuleSet({ id, name, moduleIdsJson: JSON.stringify(moduleIds || []), sortOrder }),
  deleteModuleSet: (id) => target.deleteModuleSet({ id }),
  inspectSqliteModule: (path) => target.inspectSqliteModule({ path }),
  queryModule: (path, sql, args = []) => target.queryModule({ path, sql, args }),
  readTheWordChapter: (path, bookId, chapter) => target.readTheWordChapter({ path, bookId, chapter }),
  getEpubInfo: (path) => target.getEpubInfo({ path }),
  readEpubChapter: (path, chapterIndex) => target.readEpubChapter({ path, chapterIndex }),
  getPdfInfo: (path) => target.getPdfInfo({ path }),
  renderPdfPage: (path, pageIndex, maxWidth = 1400) => target.renderPdfPage({ path, pageIndex, maxWidth }),
  userDataAction: (action, payload = {}) => target.userDataAction({ action, payload }),
  searchModules: (query, moduleIds = [], limit = 80) => target.searchModules({ query, moduleIds, limit }),
  indexModuleForSearch: (moduleId) => target.indexModuleForSearch({ moduleId }),
  getSearchIndexStats: () => target.getSearchIndexStats()
};
