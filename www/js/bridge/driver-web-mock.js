export const webMockDriver = {
  isNative: false,

  async checkStoragePermission() {
    return { granted: true, sdkInt: 0 };
  },

  async requestStoragePermission() {
    return {};
  },

  async getDiagnostics() {
    return {
      deviceModel: 'Navegador Web (Modo Simulação)',
      androidVersion: 'N/A',
      sdkInt: 0,
      sqliteVersion: 'Simulado (instale o APK no Y700)',
      fts5Supported: true,
      maxPoolSize: 14,
      currentPoolOpen: 0,
      volumes: [
        { label: 'Interno (Mock)', path: '/storage/emulated/0/mysword', isPrimary: true, isRemovable: false },
        { label: 'microSD (Mock)', path: '/storage/SDCARD/ModulosBiblicos', isPrimary: false, isRemovable: true }
      ]
    };
  },

  async scanDirectory({ path }) {
    const sample = [
      { name: 'ARA.bbl.mybible', path: `${path}/ARA.bbl.mybible`, format: 'mysword', type: 'bible', isSqlite: true, sizeBytes: 4718592 },
      { name: 'Enciclopedia-Ilustrada.bok.mybible', path: `${path}/Enciclopedia-Ilustrada.bok.mybible`, format: 'mysword', type: 'book', isSqlite: true, sizeBytes: 642252800 },
      { name: 'StrongPT.dct.mybible', path: `${path}/StrongPT.dct.mybible`, format: 'mysword', type: 'dictionary', isSqlite: true, sizeBytes: 18874368 },
      { name: 'Comentarios-NT.cmt.twm', path: `${path}/Comentarios-NT.cmt.twm`, format: 'theword', type: 'commentary', isSqlite: true, sizeBytes: 94371840 },
      { name: 'Teologia-Sistematica.epub', path: `${path}/Teologia-Sistematica.epub`, format: 'epub', type: 'book', isSqlite: false, sizeBytes: 12582912 },
      { name: 'Atlas-Biblico.pdf', path: `${path}/Atlas-Biblico.pdf`, format: 'pdf', type: 'document', isSqlite: false, sizeBytes: 214958080 }
    ];
    return { path, total: sample.length, durationMs: 4, files: sample };
  },

  async inspectSqliteModule({ path }) {
    return {
      path,
      openMs: 2,
      poolOpenCount: 1,
      tables: ['Bible', 'Details', 'sqlite_stat1']
    };
  },

  async queryModule() {
    return { queryMs: 1, rowCount: 0, rows: [] };
  }
};
