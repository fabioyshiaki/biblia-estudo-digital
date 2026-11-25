import { webMockDriver } from './driver-web-mock.js';

function getNativePlugin() {
  const cap = window.Capacitor;
  if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
    return cap.Plugins && cap.Plugins.BibleEngine ? cap.Plugins.BibleEngine : null;
  }
  return null;
}

const native = getNativePlugin();

export const engineApi = {
  isNative: Boolean(native),

  checkStoragePermission() {
    return native ? native.checkStoragePermission() : webMockDriver.checkStoragePermission();
  },

  requestStoragePermission() {
    return native ? native.requestStoragePermission() : webMockDriver.requestStoragePermission();
  },

  getDiagnostics() {
    return native ? native.getDiagnostics() : webMockDriver.getDiagnostics();
  },

  scanDirectory(path) {
    return native ? native.scanDirectory({ path }) : webMockDriver.scanDirectory({ path });
  },

  inspectSqliteModule(path) {
    return native ? native.inspectSqliteModule({ path }) : webMockDriver.inspectSqliteModule({ path });
  },

  queryModule(path, sql, args = []) {
    return native
      ? native.queryModule({ path, sql, args })
      : webMockDriver.queryModule({ path, sql, args });
  }
};
