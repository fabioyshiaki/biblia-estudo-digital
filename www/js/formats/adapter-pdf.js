import { engineApi } from '../bridge/engine-api.js';

const pdfInfoCache = new Map();
const pageCache = new Map();
const MAX_PAGE_CACHE = 4;

function putPageCache(key, value) {
  if (pageCache.has(key)) pageCache.delete(key);
  if (pageCache.size >= MAX_PAGE_CACHE) {
    const oldest = pageCache.keys().next().value;
    pageCache.delete(oldest);
  }
  pageCache.set(key, value);
}

export const pdfAdapter = {
  async getInfo(mod) {
    if (pdfInfoCache.has(mod.path)) {
      return pdfInfoCache.get(mod.path);
    }
    const info = await engineApi.getPdfInfo(mod.path);
    if (pdfInfoCache.size >= 8) {
      const oldest = pdfInfoCache.keys().next().value;
      pdfInfoCache.delete(oldest);
    }
    pdfInfoCache.set(mod.path, info);
    return info;
  },

  async renderPage(mod, pageIndex, maxWidth = 1400) {
    const safeIdx = Math.max(0, Number(pageIndex) || 0);
    const key = `${mod.path}|${safeIdx}|${maxWidth}`;
    if (pageCache.has(key)) {
      return pageCache.get(key);
    }
    const page = await engineApi.renderPdfPage(mod.path, safeIdx, maxWidth);
    putPageCache(key, page);
    return page;
  }
};
