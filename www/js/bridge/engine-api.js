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

  checkStoragePermission() {
    return target.checkStoragePermission();
  },

  requestStoragePermission() {
    return target.requestStoragePermission();
  },

  getDiagnostics() {
    return target.getDiagnostics();
  },

  getFolders() {
    return target.getFolders();
  },

  saveFolders(folders) {
    return target.saveFolders({ folders });
  },

  syncCatalog(force = false) {
    return target.syncCatalog({ force });
  },

  getCatalog() {
    return target.getCatalog();
  },

  setModuleFavorite(id, favorite) {
    return target.setModuleFavorite({ id, favorite });
  },

  buildCoverageMap() {
    return target.buildCoverageMap();
  },

  getCoverageForBook(bookId, type = '') {
    return target.getCoverageForBook({ bookId, type });
  },

  getModuleSets() {
    return target.getModuleSets();
  },

  saveModuleSet(id, name, moduleIds, sortOrder = 0) {
    return target.saveModuleSet({
      id,
      name,
      moduleIdsJson: JSON.stringify(moduleIds || []),
      sortOrder
    });
  },

  deleteModuleSet(id) {
    return target.deleteModuleSet({ id });
  },

  inspectSqliteModule(path) {
    return target.inspectSqliteModule({ path });
  },

  queryModule(path, sql, args = []) {
    return target.queryModule({ path, sql, args });
  },

  readTheWordChapter(path, bookId, chapter) {
    return target.readTheWordChapter({ path, bookId, chapter });
  },

  getEpubInfo(path) {
    return target.getEpubInfo({ path });
  },

  readEpubChapter(path, chapterIndex) {
    return target.readEpubChapter({ path, chapterIndex });
  },

  getPdfInfo(path) {
    return target.getPdfInfo({ path });
  },

  renderPdfPage(path, pageIndex, maxWidth = 1400) {
    return target.renderPdfPage({ path, pageIndex, maxWidth });
  },

  userDataAction(action, payload = {}) {
    return target.userDataAction({ action, payload });
  }
};
