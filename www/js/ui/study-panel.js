import { store } from '../core/store.js';
import { events } from '../core/events.js';
import { getBookById, formatRef } from '../core/canon.js';
import { catalogRepo } from '../library/catalog-repo.js';
import { moduleReader } from '../formats/module-reader.js';
import { bookReaderPane } from './book-reader-pane.js';
import { notesPanel } from './notes-panel.js';
import { searchPanel } from './search-panel.js';
import { aiPanel } from './ai-panel.js';

const $ = (id) => document.getElementById(id);

let renderToken = 0;
let commentaryVerseOnly = false;
let lastDictQuery = '';

function getSupportedByType(type) {
  return store.state.modules
    .filter((m) => m.type === type && !m.locked && moduleReader.isSupported(m))
    .sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return (a.title || a.fileName).localeCompare(b.title || b.fileName, 'pt-BR');
    });
}

function updatePaneVisibility() {
  const pane = $('study-pane');
  if (!pane) return;
  pane.classList.toggle('hidden', !store.state.studyPaneOpen);

  document.querySelectorAll('.study-tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.studyTab === store.state.studyTab);
  });
}

function createModuleSelect(list, activeId, onChange) {
  const sel = document.createElement('select');
  sel.className = 'ui-select';
  sel.style.flex = '1';
  sel.style.minWidth = '0';

  for (const mod of list) {
    const opt = document.createElement('option');
    opt.value = mod.id;
    opt.textContent = `${mod.favorite ? '★ ' : ''}${mod.abbr || mod.title} — ${mod.title}`;
    if (mod.id === activeId) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', (e) => onChange(e.target.value));
  return sel;
}

async function renderResourceGuide(token) {
  const subbar = $('study-subbar');
  const body = $('study-body');
  const { bookId, chapter, verse } = store.state.currentBcv;
  const book = getBookById(bookId);

  subbar.innerHTML = '';
  const info = document.createElement('span');
  info.className = 'muted-text';
  info.style.margin = '0';
  info.textContent = `Recursos para ${formatRef({ bookId, chapter, verseStart: verse })}`;
  subbar.appendChild(info);

  body.innerHTML = '<p class="empty-state">Consultando Mapa de Cobertura...</p>';
  const covered = await catalogRepo.getCoverageForBook(bookId);
  if (token !== renderToken) return;

  const comments = covered.filter((m) => m.type === 'commentary' && moduleReader.isSupported(m));
  const bibles = covered.filter((m) => m.type === 'bible' && moduleReader.isSupported(m));
  const dicts = getSupportedByType('dictionary').slice(0, 8);

  body.innerHTML = '';
  const frag = document.createDocumentFragment();

  if (covered.length === 0) {
    const p = document.createElement('p');
    p.className = 'muted-text';
    p.textContent = 'Mapa de Cobertura ainda vazio para este livro. Use "Mapear Livros" na aba Biblioteca.';
    frag.appendChild(p);
  }

  appendGroup(frag, `Comentários para ${book ? book.name : 'este livro'} (${comments.length})`, comments.slice(0, 40), (m) => {
    store.setActiveModule('commentary', m.id);
    store.setStudyTab('commentary');
  });

  appendGroup(frag, `Bíblias disponíveis (${bibles.length})`, bibles.slice(0, 20), (m) => {
    store.setActiveModule('bible', m.id);
  });

  appendGroup(frag, 'Dicionários / Léxicos rápidos', dicts, (m) => {
    store.setActiveModule('dictionary', m.id);
    store.setStudyTab('dictionary');
  });

  body.appendChild(frag);
}

function appendGroup(parent, headingText, list, onPick) {
  if (list.length === 0) return;
  const h = document.createElement('div');
  h.className = 'study-entry-head';
  h.style.marginTop = '8px';
  h.textContent = headingText;
  parent.appendChild(h);

  for (const mod of list) {
    const item = document.createElement('div');
    item.className = 'rg-item';

    const left = document.createElement('div');
    left.style.minWidth = '0';
    const title = document.createElement('div');
    title.className = 'vrow-title';
    title.textContent = mod.title;
    const sub = document.createElement('div');
    sub.className = 'vrow-sub';
    sub.textContent = `${mod.abbr || ''} · ${mod.format.toUpperCase()}`;
    left.append(title, sub);

    const arrow = document.createElement('span');
    arrow.className = 'module-size';
    arrow.textContent = 'Abrir →';

    item.append(left, arrow);
    item.addEventListener('click', () => onPick(mod));
    parent.appendChild(item);
  }
}

async function renderCommentaryTab(token) {
  const subbar = $('study-subbar');
  const body = $('study-body');
  const list = getSupportedByType('commentary');

  subbar.innerHTML = '';
  if (list.length === 0) {
    body.innerHTML = '<p class="empty-state">Nenhum comentário compatível encontrado.</p>';
    return;
  }

  let mod = store.getModuleById(store.state.activeCommentaryId);
  if (!mod || mod.type !== 'commentary' || !moduleReader.isSupported(mod)) {
    mod = list[0];
    store.state.activeCommentaryId = mod.id;
    store.savePrefs();
  }

  const sel = createModuleSelect(list, mod.id, (id) => store.setActiveModule('commentary', id));
  const scopeBtn = document.createElement('button');
  scopeBtn.className = `btn-ghost ${commentaryVerseOnly ? 'active' : ''}`;
  scopeBtn.style.padding = '6px 10px';
  scopeBtn.style.fontSize = '12px';
  scopeBtn.textContent = commentaryVerseOnly ? 'Só versículo' : 'Capítulo';
  scopeBtn.addEventListener('click', () => {
    commentaryVerseOnly = !commentaryVerseOnly;
    renderActiveTab();
  });
  subbar.append(sel, scopeBtn);

  body.innerHTML = '<p class="empty-state">Carregando comentário...</p>';
  const { bookId, chapter, verse } = store.state.currentBcv;

  try {
    const res = await moduleReader.readCommentary(mod, bookId, chapter);
    if (token !== renderToken) return;

    const entries = commentaryVerseOnly
      ? res.entries.filter((e) => verse >= e.fromVerse && verse <= e.toVerse)
      : res.entries;

    body.innerHTML = '';
    if (entries.length === 0) {
      body.innerHTML = `<p class="empty-state">Sem notas em ${mod.abbr} para ${formatRef({ bookId, chapter, verseStart: commentaryVerseOnly ? verse : null })}.</p>`;
      return;
    }

    const frag = document.createDocumentFragment();
    for (const entry of entries) {
      const card = document.createElement('article');
      card.className = 'study-entry';
      const head = document.createElement('div');
      head.className = 'study-entry-head';
      head.textContent = entry.fromVerse === 0
        ? `Introdução · ${mod.abbr}`
        : `${formatRef({ bookId, chapter, verseStart: entry.fromVerse, verseEnd: entry.toVerse })} · ${mod.abbr}`;

      const content = document.createElement('div');
      content.className = 'study-article';
      content.innerHTML = entry.html;

      card.append(head, content);
      frag.appendChild(card);
    }
    body.appendChild(frag);
  } catch (err) {
    if (token !== renderToken) return;
    body.innerHTML = `<p class="empty-state">Erro ao ler comentário: ${err.message || err}</p>`;
  }
}

async function renderDictionaryTab(token, overrideQuery = null) {
  const subbar = $('study-subbar');
  const body = $('study-body');
  const list = getSupportedByType('dictionary');

  subbar.innerHTML = '';
  if (list.length === 0) {
    body.innerHTML = '<p class="empty-state">Nenhum dicionário compatível encontrado.</p>';
    return;
  }

  let mod = store.getModuleById(store.state.activeDictId);
  if (!mod || mod.type !== 'dictionary' || !moduleReader.isSupported(mod)) {
    mod = list[0];
    store.state.activeDictId = mod.id;
    store.savePrefs();
  }

  if (overrideQuery !== null) lastDictQuery = overrideQuery;

  const sel = createModuleSelect(list, mod.id, (id) => store.setActiveModule('dictionary', id));
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Ex.: G26, H430, graça...';
  input.value = lastDictQuery;
  input.style.maxWidth = '160px';

  const goBtn = document.createElement('button');
  goBtn.className = 'btn-primary';
  goBtn.textContent = 'Buscar';

  const runLookup = () => {
    lastDictQuery = input.value.trim();
    renderActiveTab();
  };
  goBtn.addEventListener('click', runLookup);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runLookup();
  });

  subbar.append(sel, input, goBtn);

  if (!lastDictQuery) {
    body.innerHTML = '<p class="empty-state">Digite um termo ou código Strong (ex.: G26, H430), ou toque em um código Strong no texto bíblico.</p>';
    return;
  }

  body.innerHTML = '<p class="empty-state">Consultando dicionário...</p>';
  try {
    const res = await moduleReader.lookupDictionary(mod, lastDictQuery);
    if (token !== renderToken) return;

    body.innerHTML = '';
    if (res.entries.length === 0) {
      body.innerHTML = `<p class="empty-state">Nenhum verbete encontrado para "${lastDictQuery}" em ${mod.abbr}.</p>`;
      return;
    }

    const frag = document.createDocumentFragment();
    for (const entry of res.entries) {
      const card = document.createElement('article');
      card.className = 'study-entry';
      const head = document.createElement('div');
      head.className = 'study-entry-head';
      head.textContent = `${entry.term} · ${mod.abbr} (${res.queryMs} ms)`;
      const content = document.createElement('div');
      content.className = 'study-article';
      content.innerHTML = entry.html;
      card.append(head, content);
      frag.appendChild(card);
    }
    body.appendChild(frag);
  } catch (err) {
    if (token !== renderToken) return;
    body.innerHTML = `<p class="empty-state">Erro no dicionário: ${err.message || err}</p>`;
  }
}

async function renderActiveTab(overrideDictQuery = null) {
  updatePaneVisibility();
  if (store.state.viewMode !== 'reader' || !store.state.studyPaneOpen) return;

  const token = ++renderToken;
  const tab = store.state.studyTab;
  const hooks = {
    isStale: () => token !== renderToken,
    requestRefresh: () => renderActiveTab()
  };

  if (tab === 'resource-guide') await renderResourceGuide(token);
  else if (tab === 'commentary') await renderCommentaryTab(token);
  else if (tab === 'dictionary') await renderDictionaryTab(token, overrideDictQuery);
  else if (tab === 'book') await bookReaderPane.render($('study-subbar'), $('study-body'), hooks);
  else if (tab === 'notes') await notesPanel.render($('study-subbar'), $('study-body'), hooks);
  else if (tab === 'search') await searchPanel.render($('study-subbar'), $('study-body'), hooks);
  else if (tab === 'ai') await aiPanel.render($('study-subbar'), $('study-body'), hooks);
}

function handleStudyBodyClick(e) {
  const strongBtn = e.target.closest('.v-strong');
  if (strongBtn) {
    events.emit('word:selected', { strong: strongBtn.dataset.strong });
    return;
  }
  const xrefBtn = e.target.closest('.v-xref');
  if (xrefBtn) {
    events.emit('xref:preview', { ref: xrefBtn.dataset.ref });
  }
}

export const studyPanel = {
  init() {
    document.querySelectorAll('.study-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => store.setStudyTab(btn.dataset.studyTab));
    });

    $('btn-close-study').addEventListener('click', () => store.setStudyPaneOpen(false));
    $('study-body').addEventListener('click', handleStudyBodyClick);

    events.on('nav:goto', () => {
      const tab = store.state.studyTab;
      if (tab === 'resource-guide' || tab === 'commentary' || tab === 'notes') {
        renderActiveTab();
      }
    });
    events.on('study:changed', () => renderActiveTab());
    events.on('study:verse-focused', () => {
      if (store.state.studyTab === 'commentary' && commentaryVerseOnly) renderActiveTab();
      if (store.state.studyTab === 'resource-guide') renderActiveTab();
    });
    events.on('study:lookup-dict', ({ term }) => renderActiveTab(term));
    events.on('study:open-note-composer', (prefill) => {
      notesPanel.openComposer(prefill);
      store.setStudyTab('notes');
    });
    events.on('study:open-search', ({ query }) => {
      searchPanel.setQuery(query);
      store.setStudyTab('search');
    });
    events.on('study:ask-ai', ({ prompt }) => {
      aiPanel.askAboutPassage(prompt);
      store.setStudyTab('ai');
    });

    const refreshIfNotes = () => {
      if (store.state.studyTab === 'notes') renderActiveTab();
    };
    events.on('userdata:notes-changed', refreshIfNotes);
    events.on('userdata:bookmarks-changed', refreshIfNotes);
    events.on('userdata:clippings-changed', refreshIfNotes);
    events.on('userdata:all-changed', refreshIfNotes);

    events.on('reader:module-changed', ({ slot }) => {
      if (slot !== 'bible') renderActiveTab();
    });
    events.on('view:changed', ({ viewMode }) => {
      if (viewMode === 'reader') renderActiveTab();
    });
    events.on('theme:changed', () => {
      if (store.state.studyTab === 'book') {
        bookReaderPane.refreshThemeOnPdf($('study-body'));
      }
    });
  }
};
