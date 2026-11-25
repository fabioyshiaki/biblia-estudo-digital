let mockFolders = [
  { path: '/storage/emulated/0/mysword', label: 'MySword (Interno)', enabled: true, addedAt: 1 },
  { path: '/storage/3F08-9662/Livros', label: 'EPUB/PDF (microSD)', enabled: true, addedAt: 2 }
];

let mockModules = [
  {
    id: 'm1', path: '/storage/emulated/0/mysword/ARA.bbl.mybible', fileName: 'ARA.bbl.mybible',
    format: 'mysword', type: 'bible', isSqlite: true, title: 'Almeida Revista e Atualizada',
    abbr: 'ARA', lang: 'PT', description: 'Tradução clássica em português', sizeBytes: 4718592,
    hasStrong: true, hasMorph: false, rtl: false, locked: false, tablesCsv: 'Bible,Details',
    coverageReady: true, favorite: true
  },
  {
    id: 'm2', path: '/storage/emulated/0/mysword/BHSE.dct.mybible', fileName: 'BHSE.dct.mybible',
    format: 'mysword', type: 'dictionary', isSqlite: true, title: 'BHSE Léxico Hebraico Estendido',
    abbr: 'BHSE', lang: 'HE', description: 'Módulo lexical grande (609 MB)', sizeBytes: 638689280,
    hasStrong: true, hasMorph: true, rtl: true, locked: false, tablesCsv: 'details,dictionary',
    coverageReady: false, favorite: true
  },
  {
    id: 'm3', path: '/storage/emulated/0/mysword/BiblePicturesHD.cmt.mybible', fileName: 'BiblePicturesHD.cmt.mybible',
    format: 'mysword', type: 'commentary', isSqlite: true, title: 'Bible Pictures HD',
    abbr: 'PicHD', lang: 'EN', description: 'Comentário visual em alta definição', sizeBytes: 446586880,
    hasStrong: false, hasMorph: false, rtl: false, locked: false, tablesCsv: 'Commentary,Details',
    coverageReady: true, favorite: false
  },
  {
    id: 'm4', path: '/storage/emulated/0/mysword/SBLGNT.SQLite3', fileName: 'SBLGNT.SQLite3',
    format: 'mybible', type: 'bible', isSqlite: true, title: 'SBL Greek New Testament',
    abbr: 'SBLGNT', lang: 'EL', description: 'Novo Testamento Grego com morfologia', sizeBytes: 3145728,
    hasStrong: true, hasMorph: true, rtl: false, locked: false, tablesCsv: 'info,verses',
    coverageReady: true, favorite: false
  },
  {
    id: 'm5', path: '/storage/3F08-9662/Livros/Teologia.epub', fileName: 'Teologia.epub',
    format: 'epub', type: 'book', isSqlite: false, title: 'Teologia Sistemática',
    abbr: 'TeolSist', lang: 'PT', description: 'Livro EPUB no microSD', sizeBytes: 12582912,
    hasStrong: false, hasMorph: false, rtl: false, locked: false, tablesCsv: '',
    coverageReady: false, favorite: false
  },
  {
    id: 'm6', path: '/storage/emulated/0/mysword/ARC_theWord.ont', fileName: 'ARC_theWord.ont',
    format: 'theword', type: 'bible', isSqlite: false, title: 'Almeida Revista e Corrigida (theWord)',
    abbr: 'ARC-TW', lang: 'PT', description: 'Bíblia em texto plano theWord (.ont)', sizeBytes: 4423680,
    hasStrong: false, hasMorph: false, rtl: false, locked: false, tablesCsv: '',
    coverageReady: false, favorite: false
  },
  {
    id: 'm7', path: '/storage/3F08-9662/Livros/Hermeneutica.pdf', fileName: 'Hermeneutica.pdf',
    format: 'pdf', type: 'document', isSqlite: false, title: 'Princípios de Hermenêutica Bíblica',
    abbr: 'Hermen', lang: 'PT', description: 'Documento PDF no microSD', sizeBytes: 18874368,
    hasStrong: false, hasMorph: false, rtl: false, locked: false, tablesCsv: '',
    coverageReady: false, favorite: false
  }
];

let mockSets = [
  { id: 'set-exegese', name: 'Exegese Principal', moduleIdsJson: JSON.stringify(['m1', 'm2', 'm4']), sortOrder: 0 }
];

export const webMockDriver = {
  isNative: false,

  async checkStoragePermission() {
    return { granted: true, sdkInt: 33 };
  },

  async requestStoragePermission() {
    return {};
  },

  async getDiagnostics() {
    return {
      deviceModel: 'Navegador Web (Simulação Y700)',
      androidVersion: '13 (Mock)',
      sdkInt: 33,
      sqliteVersion: '3.32.2 (Simulado)',
      fts5Supported: false,
      maxPoolSize: 14,
      currentPoolOpen: 0,
      volumes: [
        { label: 'Interno', path: '/storage/emulated/0', isPrimary: true, isRemovable: false },
        { label: 'microSD', path: '/storage/3F08-9662', isPrimary: false, isRemovable: true }
      ]
    };
  },

  async getFolders() {
    return { folders: [...mockFolders] };
  },

  async saveFolders({ folders }) {
    mockFolders = [...folders];
  },

  async syncCatalog() {
    return { totalModules: mockModules.length, inspected: mockModules.length, cachedSkipped: 0, durationMs: 18 };
  },

  async getCatalog() {
    return { modules: [...mockModules] };
  },

  async setModuleFavorite({ id, favorite }) {
    mockModules = mockModules.map((m) => (m.id === id ? { ...m, favorite } : m));
  },

  async buildCoverageMap() {
    mockModules = mockModules.map((m) => (m.type === 'bible' || m.type === 'commentary' ? { ...m, coverageReady: true } : m));
    return { indexedModules: 3, durationMs: 25 };
  },

  async getCoverageForBook({ type }) {
    const filtered = mockModules.filter((m) => m.coverageReady && (!type || m.type === type));
    return { modules: filtered };
  },

  async getModuleSets() {
    return { sets: [...mockSets] };
  },

  async saveModuleSet({ id, name, moduleIdsJson, sortOrder }) {
    const idx = mockSets.findIndex((s) => s.id === id);
    const item = { id, name, moduleIdsJson, sortOrder, updatedAt: Date.now() };
    if (idx >= 0) mockSets[idx] = item;
    else mockSets.push(item);
  },

  async deleteModuleSet({ id }) {
    mockSets = mockSets.filter((s) => s.id !== id);
  },

  async inspectSqliteModule({ path }) {
    return { path, openMs: 3, poolOpenCount: 1, tables: ['Details', 'Bible'] };
  },

  async queryModule() {
    return { queryMs: 1, rowCount: 0, rows: [] };
  },

  async readTheWordChapter({ bookId, chapter }) {
    return {
      queryMs: 2,
      indexedNow: false,
      verses: [
        { verse: 1, raw: `Texto simulado theWord (.ont) — Livro ${bookId}, Capítulo ${chapter}, Versículo 1.` },
        { verse: 2, raw: '<FR>Palavras simuladas em destaque<Fr> com <FI>itálico editorial<Fi>.' }
      ]
    };
  },

  async getEpubInfo() {
    return {
      title: 'Teologia Sistemática (Simulação)',
      chapterCount: 2,
      queryMs: 4,
      chapters: [
        { index: 0, title: 'Capítulo 1 — Introdução', href: 'ch1.xhtml' },
        { index: 1, title: 'Capítulo 2 — Revelação e Escritura', href: 'ch2.xhtml' }
      ]
    };
  },

  async readEpubChapter({ chapterIndex }) {
    return {
      index: chapterIndex,
      title: `Capítulo ${chapterIndex + 1} (Simulação EPUB)`,
      html: `<p>Conteúdo editorial simulado do capítulo ${chapterIndex + 1} do livro EPUB.</p>`,
      chapterCount: 2,
      queryMs: 3
    };
  },

  async getPdfInfo() {
    return { pageCount: 10, queryMs: 5 };
  },

  async renderPdfPage({ pageIndex }) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1100"><rect width="100%" height="100%" fill="#ffffff"/><text x="60" y="120" font-size="32" fill="#1a1a1a">Página PDF Simulada #${pageIndex + 1}</text></svg>`;
    return {
      pageIndex,
      pageCount: 10,
      width: 800,
      height: 1100,
      dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      queryMs: 6
    };
  }
};
