import { store } from '../core/store.js';
import { moduleReader } from '../formats/module-reader.js';

const PROGRESS_KEY = 'bed_doc_progress_v1';

let lastModuleId = null;
let activeTopicId = null;
let activePdfPage = 0;
let pdfNightOverride = null;

function loadProgressMap() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveProgress(modId, value) {
  try {
    const map = loadProgressMap();
    map[modId] = value;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
  } catch {
    // Ignora erro de quota
  }
}

function getSavedProgress(modId) {
  const map = loadProgressMap();
  return map[modId] ?? null;
}

function getSupportedDocs() {
  return store.state.modules
    .filter((m) => (m.type === 'book' || m.type === 'document') && !m.locked && moduleReader.isSupported(m))
    .sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return (a.title || a.fileName).localeCompare(b.title || b.fileName, 'pt-BR');
    });
}

function isPdfNightActive() {
  if (pdfNightOverride !== null) return pdfNightOverride;
  return store.state.theme === 'charcoal' || store.state.theme === 'night';
}

function applyPdfFilter(imgEl) {
  if (!imgEl) return;
  const night = isPdfNightActive();
  const sepia = !night && store.state.theme === 'sepia';
  imgEl.classList.toggle('pdf-night-mode', night);
  imgEl.classList.toggle('pdf-sepia-mode', sepia);
}

function createDocSelect(list, activeId, onChange) {
  const sel = document.createElement('select');
  sel.className = 'ui-select';
  sel.style.flex = '1';
  sel.style.minWidth = '150px';

  for (const mod of list) {
    const opt = document.createElement('option');
    opt.value = mod.id;
    const tag = mod.format === 'pdf' ? '[PDF] ' : (mod.format === 'epub' ? '[EPUB] ' : '');
    opt.textContent = `${mod.favorite ? '★ ' : ''}${tag}${mod.title || mod.fileName}`;
    if (mod.id === activeId) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', (e) => onChange(e.target.value));
  return sel;
}

async function renderPdfView(mod, subbar, body, { isStale, requestRefresh }) {
  const info = await moduleReader.getPdfInfo(mod);
  if (isStale()) return;

  const pageCount = Math.max(1, Number(info.pageCount || 1));
  activePdfPage = Math.max(0, Math.min(activePdfPage, pageCount - 1));
  saveProgress(mod.id, activePdfPage);

  const controls = document.createElement('div');
  controls.className = 'pdf-controls';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'btn-ghost';
  prevBtn.textContent = '←';
  prevBtn.disabled = activePdfPage <= 0;
  prevBtn.addEventListener('click', () => {
    activePdfPage = Math.max(0, activePdfPage - 1);
    requestRefresh();
  });

  const pageInput = document.createElement('input');
  pageInput.type = 'number';
  pageInput.className = 'pdf-page-input';
  pageInput.min = '1';
  pageInput.max = String(pageCount);
  pageInput.value = String(activePdfPage + 1);
  pageInput.addEventListener('change', () => {
    const target = parseInt(pageInput.value, 10);
    if (!Number.isNaN(target)) {
      activePdfPage = Math.max(0, Math.min(pageCount - 1, target - 1));
      requestRefresh();
    }
  });

  const totalSpan = document.createElement('span');
  totalSpan.className = 'module-size';
  totalSpan.textContent = `/ ${pageCount}`;

  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn-ghost';
  nextBtn.textContent = '→';
  nextBtn.disabled = activePdfPage >= pageCount - 1;
  nextBtn.addEventListener('click', () => {
    activePdfPage = Math.min(pageCount - 1, activePdfPage + 1);
    requestRefresh();
  });

  const nightBtn = document.createElement('button');
  nightBtn.className = `chip ${isPdfNightActive() ? 'active' : ''}`;
  nightBtn.textContent = isPdfNightActive() ? 'Noturno: ON' : 'Noturno: OFF';
  nightBtn.addEventListener('click', () => {
    pdfNightOverride = !isPdfNightActive();
    nightBtn.classList.toggle('active', pdfNightOverride);
    nightBtn.textContent = pdfNightOverride ? 'Noturno: ON' : 'Noturno: OFF';
    applyPdfFilter(body.querySelector('.pdf-page-img'));
  });

  controls.append(prevBtn, pageInput, totalSpan, nextBtn, nightBtn);
  subbar.appendChild(controls);

  body.innerHTML = `<p class="empty-state">Renderizando página ${activePdfPage + 1} de ${pageCount}...</p>`;

  const dpr = Math.min(window.devicePixelRatio || 2, 2.2);
  const targetWidth = Math.min(1800, Math.max(960, Math.round((body.clientWidth || 680) * dpr)));

  try {
    const page = await moduleReader.renderPdfPage(mod, activePdfPage, targetWidth);
    if (isStale()) return;

    body.innerHTML = '';
    const stage = document.createElement('div');
    stage.className = 'pdf-stage';

    const meta = document.createElement('div');
    meta.className = 'study-entry-head';
    meta.textContent = `Página ${page.pageIndex + 1} de ${page.pageCount} · ${page.queryMs} ms`;

    const img = document.createElement('img');
    img.className = 'pdf-page-img';
    img.src = page.dataUrl;
    img.alt = `Página ${page.pageIndex + 1}`;
    applyPdfFilter(img);

    const footer = document.createElement('div');
    footer.className = 'pdf-footer-nav';

    const fPrev = document.createElement('button');
    fPrev.className = 'btn-ghost';
    fPrev.textContent = '← Página anterior';
    fPrev.disabled = activePdfPage <= 0;
    fPrev.addEventListener('click', () => {
      activePdfPage = Math.max(0, activePdfPage - 1);
      body.scrollTop = 0;
      requestRefresh();
    });

    const fNext = document.createElement('button');
    fNext.className = 'btn-primary';
    fNext.textContent = 'Próxima página →';
    fNext.disabled = activePdfPage >= pageCount - 1;
    fNext.addEventListener('click', () => {
      activePdfPage = Math.min(pageCount - 1, activePdfPage + 1);
      body.scrollTop = 0;
      requestRefresh();
    });

    footer.append(fPrev, fNext);
    stage.append(meta, img, footer);
    body.appendChild(stage);
    body.scrollTop = 0;

    // Pré-carrega silenciosamente a próxima página no cache LRU
    if (activePdfPage + 1 < pageCount) {
      moduleReader.renderPdfPage(mod, activePdfPage + 1, targetWidth).catch(() => {});
    }
  } catch (err) {
    if (isStale()) return;
    body.innerHTML = `<p class="empty-state">Erro ao renderizar PDF: ${err.message || err}</p>`;
  }
}

async function renderTextBookView(mod, subbar, body, { isStale, requestRefresh }) {
  if (activeTopicId !== null) {
    const backBtn = document.createElement('button');
    backBtn.className = 'btn-ghost';
    backBtn.textContent = '← Índice';
    backBtn.addEventListener('click', () => {
      activeTopicId = null;
      requestRefresh();
    });
    subbar.appendChild(backBtn);

    body.innerHTML = '<p class="empty-state">Abrindo capítulo...</p>';
    try {
      const topic = await moduleReader.readBookTopic(mod, activeTopicId);
      if (isStale()) return;

      body.innerHTML = '';
      if (!topic) {
        body.innerHTML = '<p class="empty-state">Capítulo ou tópico não encontrado.</p>';
        return;
      }

      saveProgress(mod.id, activeTopicId);

      const head = document.createElement('div');
      head.className = 'study-entry-head';
      head.textContent = topic.title || mod.title;

      const art = document.createElement('div');
      art.className = 'study-article';
      art.innerHTML = topic.html;

      body.append(head, art);

      if (mod.format === 'epub' && topic.chapterCount > 1) {
        const idx = Number(activeTopicId);
        const footer = document.createElement('div');
        footer.className = 'pdf-footer-nav';

        const prevCh = document.createElement('button');
        prevCh.className = 'btn-ghost';
        prevCh.textContent = '← Cap. anterior';
        prevCh.disabled = idx <= 0;
        prevCh.addEventListener('click', () => {
          activeTopicId = idx - 1;
          body.scrollTop = 0;
          requestRefresh();
        });

        const nextCh = document.createElement('button');
        nextCh.className = 'btn-primary';
        nextCh.textContent = 'Próximo cap. →';
        nextCh.disabled = idx >= topic.chapterCount - 1;
        nextCh.addEventListener('click', () => {
          activeTopicId = idx + 1;
          body.scrollTop = 0;
          requestRefresh();
        });

        footer.append(prevCh, nextCh);
        body.appendChild(footer);
      }
      body.scrollTop = 0;
    } catch (err) {
      if (isStale()) return;
      body.innerHTML = `<p class="empty-state">Erro ao abrir capítulo: ${err.message || err}</p>`;
    }
    return;
  }

  body.innerHTML = '<p class="empty-state">Carregando índice da obra...</p>';
  try {
    const res = await moduleReader.listBookTopics(mod, 250, 0);
    if (isStale()) return;

    body.innerHTML = '';
    const frag = document.createDocumentFragment();
    const savedId = getSavedProgress(mod.id);

    if (savedId !== null) {
      const resumeBar = document.createElement('div');
      resumeBar.className = 'book-resume-bar';
      const resumeBtn = document.createElement('button');
      resumeBtn.className = 'btn-primary';
      resumeBtn.textContent = 'Continuar de onde parou →';
      resumeBtn.addEventListener('click', () => {
        activeTopicId = savedId;
        requestRefresh();
      });
      resumeBar.appendChild(resumeBtn);
      frag.appendChild(resumeBar);
    }

    if (!res.topics || res.topics.length === 0) {
      body.innerHTML = '<p class="empty-state">Nenhum capítulo ou tópico encontrado neste livro.</p>';
      return;
    }

    for (const t of res.topics) {
      const item = document.createElement('div');
      item.className = 'rg-item';
      const title = document.createElement('div');
      title.className = 'vrow-title';
      title.textContent = t.title;
      item.appendChild(title);
      item.addEventListener('click', () => {
        activeTopicId = t.id;
        requestRefresh();
      });
      frag.appendChild(item);
    }
    body.appendChild(frag);
  } catch (err) {
    if (isStale()) return;
    body.innerHTML = `<p class="empty-state">Erro ao carregar índice: ${err.message || err}</p>`;
  }
}

export const bookReaderPane = {
  refreshThemeOnPdf(bodyEl) {
    if (!bodyEl) return;
    applyPdfFilter(bodyEl.querySelector('.pdf-page-img'));
  },

  async render(subbar, body, hooks) {
    const list = getSupportedDocs();
    subbar.innerHTML = '';

    if (list.length === 0) {
      body.innerHTML = '<p class="empty-state">Nenhum livro (.bok, .twm, EPUB) ou PDF encontrado no catálogo.</p>';
      return;
    }

    let mod = store.getModuleById(store.state.activeBookId);
    if (!mod || (mod.type !== 'book' && mod.type !== 'document') || !moduleReader.isSupported(mod)) {
      mod = list[0];
      store.state.activeBookId = mod.id;
      store.savePrefs();
    }

    if (lastModuleId !== mod.id) {
      lastModuleId = mod.id;
      activeTopicId = null;
      const saved = getSavedProgress(mod.id);
      activePdfPage = mod.format === 'pdf' && typeof saved === 'number' ? saved : 0;
    }

    const sel = createDocSelect(list, mod.id, (id) => {
      store.setActiveModule('book', id);
    });
    subbar.appendChild(sel);

    if (mod.format === 'pdf') {
      await renderPdfView(mod, subbar, body, hooks);
    } else {
      await renderTextBookView(mod, subbar, body, hooks);
    }
  }
};
