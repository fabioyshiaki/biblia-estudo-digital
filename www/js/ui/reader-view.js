import { store } from '../core/store.js';
import { events } from '../core/events.js';
import { BOOKS, getBookById, formatRef } from '../core/canon.js';
import { moduleReader } from '../formats/module-reader.js';
import { navSelector } from './nav-selector.js';

const $ = (id) => document.getElementById(id);

const chapterCache = new Map();
const MAX_CACHE = 10;
let renderToken = 0;

function getSupportedBibles() {
  return store.state.modules
    .filter((m) => m.type === 'bible' && !m.locked && moduleReader.isSupported(m))
    .sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return (a.title || a.fileName).localeCompare(b.title || b.fileName, 'pt-BR');
    });
}

function ensureActiveBible() {
  const bibles = getSupportedBibles();
  if (bibles.length === 0) return null;

  const current = store.getModuleById(store.state.activeBibleId);
  if (current && current.type === 'bible' && moduleReader.isSupported(current)) {
    return current;
  }

  const preferred =
    bibles.find((b) => b.favorite) ||
    bibles.find((b) => b.lang === 'PT') ||
    bibles[0];

  store.state.activeBibleId = preferred.id;
  store.savePrefs();
  return preferred;
}

function populateBibleSelector() {
  const select = $('select-bible-module');
  if (!select) return;

  const bibles = getSupportedBibles();
  const active = ensureActiveBible();
  select.innerHTML = '';

  if (bibles.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Nenhuma Bíblia compatível';
    select.appendChild(opt);
    return;
  }

  for (const mod of bibles) {
    const opt = document.createElement('option');
    opt.value = mod.id;
    const prefix = mod.favorite ? '★ ' : '';
    const lang = mod.lang ? ` [${mod.lang}]` : '';
    opt.textContent = `${prefix}${mod.abbr || mod.title}${lang} — ${mod.title}`;
    if (active && mod.id === active.id) opt.selected = true;
    select.appendChild(opt);
  }
}

function cacheSet(key, value) {
  if (chapterCache.size >= MAX_CACHE) {
    const oldest = chapterCache.keys().next().value;
    chapterCache.delete(oldest);
  }
  chapterCache.set(key, value);
}

async function fetchChapterCached(mod, bookId, chapter) {
  const key = `${mod.id}:${bookId}:${chapter}`;
  if (chapterCache.has(key)) return chapterCache.get(key);
  const data = await moduleReader.readChapter(mod, bookId, chapter);
  cacheSet(key, data);
  return data;
}

function getAdjacentChapter(bookId, chapter, delta) {
  const book = getBookById(bookId);
  if (!book) return null;

  const nextCh = chapter + delta;
  if (nextCh >= 1 && nextCh <= book.chapters) {
    return { bookId, chapter: nextCh, verse: 1 };
  }

  const idx = BOOKS.findIndex((b) => b.id === bookId);
  const targetBook = BOOKS[idx + delta];
  if (!targetBook) return null;

  return {
    bookId: targetBook.id,
    chapter: delta > 0 ? 1 : targetBook.chapters,
    verse: 1
  };
}

function preloadNext(mod, bookId, chapter) {
  const next = getAdjacentChapter(bookId, chapter, 1);
  if (!next) return;
  const key = `${mod.id}:${next.bookId}:${next.chapter}`;
  if (chapterCache.has(key)) return;
  moduleReader.readChapter(mod, next.bookId, next.chapter)
    .then((data) => cacheSet(key, data))
    .catch(() => {});
}

function updateToolbarButtons() {
  const { currentBcv, navIndex, navHistory, showStrongs, studyPaneOpen } = store.state;
  const book = getBookById(currentBcv.bookId);

  $('btn-open-nav').textContent = book
    ? `${book.name} ${currentBcv.chapter}`
    : formatRef(currentBcv);

  $('btn-nav-back').disabled = navIndex <= 0;
  $('btn-nav-fwd').disabled = navIndex >= navHistory.length - 1;

  const btnStrong = $('btn-toggle-strongs');
  btnStrong.classList.toggle('active', showStrongs);
  btnStrong.textContent = showStrongs ? 'Strong: ON' : 'Strong: OFF';

  const btnStudy = $('btn-toggle-study');
  btnStudy.classList.toggle('active', studyPaneOpen);
}

function applyReaderPrefs() {
  const article = $('chapter-article');
  if (!article) return;
  article.classList.toggle('hide-strongs', !store.state.showStrongs);
  updateToolbarButtons();
}

function highlightActiveVerse(verseNum, { scroll = false } = {}) {
  const article = $('chapter-article');
  if (!article) return;

  article.querySelectorAll('.verse-item.active').forEach((el) => el.classList.remove('active'));
  const target = article.querySelector(`.verse-item[data-verse="${verseNum}"]`);
  if (!target) return;

  target.classList.add('active');
  if (scroll) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

async function renderChapter() {
  if (store.state.viewMode !== 'reader') return;

  const article = $('chapter-article');
  const mod = ensureActiveBible();
  const { bookId, chapter, verse } = store.state.currentBcv;
  const token = ++renderToken;

  updateToolbarButtons();

  if (!mod) {
    article.innerHTML = '<p class="empty-state">Nenhuma Bíblia MySword ou MyBible disponível no catálogo. Sincronize suas pastas na aba Biblioteca.</p>';
    return;
  }

  article.classList.toggle('reader-rtl', Boolean(mod.rtl));
  article.classList.toggle('hide-strongs', !store.state.showStrongs);
  article.innerHTML = '<p class="empty-state">Carregando capítulo...</p>';

  try {
    const res = await fetchChapterCached(mod, bookId, chapter);
    if (token !== renderToken) return;

    const book = getBookById(bookId);
    const frag = document.createDocumentFragment();

    const heading = document.createElement('h2');
    heading.className = 'chapter-heading';
    heading.textContent = book ? `${book.name} ${chapter}` : `Capítulo ${chapter}`;

    const meta = document.createElement('div');
    meta.className = 'chapter-meta';
    meta.textContent = `${mod.title} (${mod.abbr}) · ${res.verses.length} versículos · ${res.queryMs} ms`;

    frag.append(heading, meta);

    if (res.verses.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Este módulo não contém versículos para este capítulo (ex.: módulo exclusivo do NT ou AT).';
      frag.appendChild(empty);
    } else {
      for (const v of res.verses) {
        const div = document.createElement('div');
        div.className = 'verse-item';
        div.dataset.verse = String(v.verse);

        const num = document.createElement('span');
        num.className = 'verse-num';
        num.textContent = String(v.verse);

        const body = document.createElement('span');
        body.className = 'verse-text';
        body.innerHTML = v.html;

        div.append(num, body);
        frag.appendChild(div);
      }
    }

    const footer = document.createElement('div');
    footer.className = 'chapter-footer-nav';

    const prevTarget = getAdjacentChapter(bookId, chapter, -1);
    const nextTarget = getAdjacentChapter(bookId, chapter, 1);

    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn-ghost';
    prevBtn.textContent = prevTarget ? `← ${formatRef(prevTarget)}` : 'Início';
    prevBtn.disabled = !prevTarget;
    if (prevTarget) prevBtn.addEventListener('click', () => store.setCurrentBcv(prevTarget));

    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn-primary';
    nextBtn.textContent = nextTarget ? `${formatRef(nextTarget)} →` : 'Fim';
    nextBtn.disabled = !nextTarget;
    if (nextTarget) nextBtn.addEventListener('click', () => store.setCurrentBcv(nextTarget));

    footer.append(prevBtn, nextBtn);
    frag.appendChild(footer);

    article.innerHTML = '';
    article.appendChild(frag);

    const scrollBox = $('reader-scroll');
    if (verse > 1) {
      highlightActiveVerse(verse, { scroll: true });
    } else {
      scrollBox.scrollTop = 0;
      highlightActiveVerse(1, { scroll: false });
    }

    preloadNext(mod, bookId, chapter);
  } catch (err) {
    if (token !== renderToken) return;
    article.innerHTML = `<p class="empty-state">Erro ao ler capítulo: ${err.message || err}</p>`;
  }
}

function handleArticleClick(e) {
  const strongBtn = e.target.closest('.v-strong');
  if (strongBtn) {
    e.stopPropagation();
    events.emit('word:selected', { strong: strongBtn.dataset.strong });
    return;
  }

  const morphBtn = e.target.closest('.v-morph');
  if (morphBtn) {
    e.stopPropagation();
    events.emit('word:selected', { morph: morphBtn.dataset.morph });
    return;
  }

  const fnBtn = e.target.closest('.v-fn');
  if (fnBtn) {
    e.stopPropagation();
    const row = e.target.closest('.verse-item');
    const vNum = row ? Number(row.dataset.verse) : store.state.currentBcv.verse;
    events.emit('note:preview', {
      note: fnBtn.dataset.note,
      bcv: { ...store.state.currentBcv, verseStart: vNum }
    });
    return;
  }

  const xrefBtn = e.target.closest('.v-xref');
  if (xrefBtn) {
    e.stopPropagation();
    events.emit('xref:preview', { ref: xrefBtn.dataset.ref });
    return;
  }

  const verseEl = e.target.closest('.verse-item');
  if (verseEl) {
    const vNum = Number(verseEl.dataset.verse || 1);
    store.state.currentBcv = { ...store.state.currentBcv, verse: vNum };
    store.savePrefs();
    highlightActiveVerse(vNum, { scroll: false });

    const textClone = verseEl.querySelector('.verse-text').cloneNode(true);
    textClone.querySelectorAll('.v-strong, .v-morph, .v-fn, .v-xref').forEach((n) => n.remove());
    const cleanText = textClone.textContent.replace(/\s+/g, ' ').trim();

    events.emit('verse:selected', {
      bcv: store.state.currentBcv,
      moduleId: store.state.activeBibleId,
      text: cleanText
    });
    events.emit('study:verse-focused', { bcv: store.state.currentBcv });
  }
}

export const readerView = {
  init() {
    store.setFontSize(store.state.fontSize);

    $('btn-open-nav').addEventListener('click', () => navSelector.open());
    $('btn-nav-back').addEventListener('click', () => store.goBack());$('btn-nav-fwd').addEventListener('click', () => store.goForward());

    $('select-bible-module').addEventListener('change', (e) => {
      if (e.target.value) store.setActiveModule('bible', e.target.value);
    });

    $('btn-font-dec').addEventListener('click', () => store.setFontSize(store.state.fontSize - 2));$('btn-font-inc').addEventListener('click', () => store.setFontSize(store.state.fontSize + 2));
    $('btn-toggle-strongs').addEventListener('click', () => store.toggleStrongs());$('btn-toggle-study').addEventListener('click', () => store.setStudyPaneOpen(!store.state.studyPaneOpen));

    $('chapter-article').addEventListener('click', handleArticleClick);

    document.addEventListener('keydown', (e) => {
      if (store.state.viewMode !== 'reader' || !e.altKey) return;
      const { bookId, chapter } = store.state.currentBcv;
      if (e.key === 'ArrowLeft') {
        const prev = getAdjacentChapter(bookId, chapter, -1);
        if (prev) store.setCurrentBcv(prev);
      } else if (e.key === 'ArrowRight') {
        const next = getAdjacentChapter(bookId, chapter, 1);
        if (next) store.setCurrentBcv(next);
      }
    });

    events.on('catalog:updated', () => {
      populateBibleSelector();
      if (store.state.viewMode === 'reader') renderChapter();
    });
    events.on('nav:goto', renderChapter);
    events.on('reader:module-changed', ({ slot }) => {
      if (slot === 'bible') {
        populateBibleSelector();
        renderChapter();
      }
    });
    events.on('reader:prefs-changed', applyReaderPrefs);
    events.on('study:changed', updateToolbarButtons);
    events.on('view:changed', ({ viewMode }) => {
      if (viewMode === 'reader') {
        populateBibleSelector();
        renderChapter();
      }
    });
  }
};
