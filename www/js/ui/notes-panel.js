import { store } from '../core/store.js';
import { formatRef } from '../core/canon.js';
import { userDataRepo } from '../study/user-data-repo.js';

const DEFAULT_BACKUP_PATH = '/storage/emulated/0/Documents/BibliaEstudoDigital/backup_estudos.json';

let activeSubtab = 'notes';
let notesScopeChapter = true;
let notesSearch = '';
let clipsScopeChapter = false;
let editingNote = null;
let backupStatusMsg = '';

function formatDate(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch {
    return '';
  }
}

function renderSubtabBar(subbar, requestRefresh) {
  const tabs = [
    ['notes', 'Notas'],
    ['bookmarks', 'Marcadores'],
    ['clippings', 'Recortes'],
    ['backup', 'Backup']
  ];
  for (const [id, label] of tabs) {
    const btn = document.createElement('button');
    btn.className = `chip ${activeSubtab === id ? 'active' : ''}`;
    btn.textContent = label;
    btn.addEventListener('click', () => {
      activeSubtab = id;
      editingNote = null;
      requestRefresh();
    });
    subbar.appendChild(btn);
  }
}

function renderNoteEditor(body, requestRefresh) {
  const form = document.createElement('div');
  form.className = 'study-form-card';

  const refLabel = formatRef({
    bookId: editingNote.bookId,
    chapter: editingNote.chapter,
    verseStart: editingNote.verseStart,
    verseEnd: editingNote.verseEnd
  });

  const head = document.createElement('div');
  head.className = 'study-entry-head';
  head.textContent = editingNote.id ? `Editando nota · ${refLabel}` : `Nova nota · ${refLabel}`;

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.placeholder = 'Título da nota (opcional)';
  titleInput.value = editingNote.title || '';

  const tagsInput = document.createElement('input');
  tagsInput.type = 'text';
  tagsInput.placeholder = 'Tags separadas por vírgula (ex.: exegese, sermão)';
  tagsInput.value = editingNote.tagsCsv || '';

  const bodyArea = document.createElement('textarea');
  bodyArea.className = 'study-textarea';
  bodyArea.rows = 6;
  bodyArea.placeholder = 'Escreva sua anotação exegética ou devocional...';
  bodyArea.value = editingNote.body || '';

  const actions = document.createElement('div');
  actions.className = 'btn-row';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-primary';
  saveBtn.textContent = 'Salvar nota';
  saveBtn.addEventListener('click', async () => {
    const text = bodyArea.value.trim();
    if (!text) return;
    await userDataRepo.saveNote({
      ...editingNote,
      title: titleInput.value.trim(),
      tagsCsv: tagsInput.value.trim(),
      body: text
    });
    editingNote = null;
    requestRefresh();
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-ghost';
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.addEventListener('click', () => {
    editingNote = null;
    requestRefresh();
  });

  actions.append(saveBtn, cancelBtn);
  form.append(head, titleInput, tagsInput, bodyArea, actions);
  body.appendChild(form);
}

async function renderNotesView(body, { isStale, requestRefresh }) {
  const cur = store.state.currentBcv;

  const bar = document.createElement('div');
  bar.className = 'study-inline-bar';

  const newBtn = document.createElement('button');
  newBtn.className = 'btn-primary';
  newBtn.textContent = '+ Nova nota';
  newBtn.addEventListener('click', () => {
    editingNote = {
      id: '',
      bookId: cur.bookId,
      chapter: cur.chapter,
      verseStart: cur.verse || 1,
      verseEnd: cur.verse || 1,
      title: '',
      body: '',
      tagsCsv: ''
    };
    requestRefresh();
  });

  const scopeBtn = document.createElement('button');
  scopeBtn.className = `btn-ghost ${notesScopeChapter ? 'active' : ''}`;
  scopeBtn.textContent = notesScopeChapter ? 'Capítulo atual' : 'Todas';
  scopeBtn.addEventListener('click', () => {
    notesScopeChapter = !notesScopeChapter;
    requestRefresh();
  });

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Filtrar notas ou tags...';
  searchInput.value = notesSearch;
  searchInput.style.flex = '1';
  searchInput.style.minWidth = '130px';
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      notesSearch = searchInput.value.trim();
      requestRefresh();
    }
  });

  bar.append(newBtn, scopeBtn, searchInput);
  body.appendChild(bar);

  if (editingNote) {
    renderNoteEditor(body, requestRefresh);
  }

  const listWrap = document.createElement('div');
  listWrap.innerHTML = '<p class="empty-state">Carregando notas...</p>';
  body.appendChild(listWrap);

  const notes = await userDataRepo.getNotes({
    bookId: notesScopeChapter ? cur.bookId : 0,
    chapter: notesScopeChapter ? cur.chapter : 0,
    query: notesSearch
  });
  if (isStale()) return;

  listWrap.innerHTML = '';
  if (notes.length === 0) {
    listWrap.innerHTML = '<p class="empty-state">Nenhuma nota encontrada neste filtro.</p>';
    return;
  }

  const frag = document.createDocumentFragment();
  for (const note of notes) {
    const card = document.createElement('article');
    card.className = 'study-entry';

    const headRow = document.createElement('div');
    headRow.className = 'study-card-head';

    const refBtn = document.createElement('button');
    refBtn.className = 'study-ref-link';
    refBtn.textContent = formatRef(note) + (note.title ? ` · ${note.title}` : '');
    refBtn.addEventListener('click', () => {
      store.setCurrentBcv({ bookId: note.bookId, chapter: note.chapter, verse: note.verseStart });
    });

    const right = document.createElement('div');
    right.className = 'btn-row';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn-ghost';
    editBtn.style.padding = '3px 8px';
    editBtn.style.fontSize = '11.5px';
    editBtn.textContent = 'Editar';
    editBtn.addEventListener('click', () => {
      editingNote = { ...note };
      requestRefresh();
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn';
    delBtn.textContent = '×';
    delBtn.title = 'Excluir nota';
    delBtn.addEventListener('click', async () => {
      await userDataRepo.deleteNote(note.id);
      requestRefresh();
    });

    right.append(editBtn, delBtn);
    headRow.append(refBtn, right);

    const text = document.createElement('div');
    text.className = 'study-note-body';
    text.textContent = note.body;

    const meta = document.createElement('div');
    meta.className = 'vrow-sub';
    meta.textContent = `${formatDate(note.updatedAt)}${note.tagsCsv ? ` · #${note.tagsCsv}` : ''}`;

    card.append(headRow, text, meta);
    frag.appendChild(card);
  }
  listWrap.appendChild(frag);
}

async function renderBookmarksView(body, { isStale, requestRefresh }) {
  const cur = store.state.currentBcv;
  const bar = document.createElement('div');
  bar.className = 'study-inline-bar';

  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.placeholder = `Rótulo para ${formatRef({ ...cur, verseStart: cur.verse })}...`;
  labelInput.style.flex = '1';

  const addBtn = document.createElement('button');
  addBtn.className = 'btn-primary';
  addBtn.textContent = 'Marcar';
  addBtn.addEventListener('click', async () => {
    await userDataRepo.saveBookmark({
      bookId: cur.bookId,
      chapter: cur.chapter,
      verse: cur.verse || 1,
      label: labelInput.value.trim()
    });
    requestRefresh();
  });

  bar.append(labelInput, addBtn);
  body.appendChild(bar);

  const list = await userDataRepo.getBookmarks();
  if (isStale()) return;

  if (list.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty-state';
    p.textContent = 'Nenhum marcador salvo ainda.';
    body.appendChild(p);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const bm of list) {
    const item = document.createElement('div');
    item.className = 'rg-item';

    const left = document.createElement('div');
    left.style.minWidth = '0';
    const title = document.createElement('div');
    title.className = 'vrow-title';
    title.textContent = formatRef({ bookId: bm.bookId, chapter: bm.chapter, verseStart: bm.verse });
    const sub = document.createElement('div');
    sub.className = 'vrow-sub';
    sub.textContent = `${bm.label || 'Marcador rápido'} · ${formatDate(bm.createdAt)}`;
    left.append(title, sub);

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await userDataRepo.deleteBookmark(bm.id);
      requestRefresh();
    });

    item.append(left, delBtn);
    item.addEventListener('click', () => {
      store.setCurrentBcv({ bookId: bm.bookId, chapter: bm.chapter, verse: bm.verse });
    });
    frag.appendChild(item);
  }
  body.appendChild(frag);
}

async function renderClippingsView(body, { isStale, requestRefresh }) {
  const cur = store.state.currentBcv;
  const bar = document.createElement('div');
  bar.className = 'study-inline-bar';

  const scopeBtn = document.createElement('button');
  scopeBtn.className = `btn-ghost ${clipsScopeChapter ? 'active' : ''}`;
  scopeBtn.textContent = clipsScopeChapter ? 'Capítulo atual' : 'Todos os recortes';
  scopeBtn.addEventListener('click', () => {
    clipsScopeChapter = !clipsScopeChapter;
    requestRefresh();
  });
  bar.appendChild(scopeBtn);
  body.appendChild(bar);

  const clips = await userDataRepo.getClippings({
    bookId: clipsScopeChapter ? cur.bookId : 0,
    chapter: clipsScopeChapter ? cur.chapter : 0
  });
  if (isStale()) return;

  if (clips.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty-state';
    p.textContent = 'Sem recortes salvos. Toque em um versículo no Leitor e clique em "Recortar".';
    body.appendChild(p);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const clip of clips) {
    const card = document.createElement('article');
    card.className = 'study-entry';

    const headRow = document.createElement('div');
    headRow.className = 'study-card-head';

    const refBtn = document.createElement('button');
    refBtn.className = 'study-ref-link';
    const refText = formatRef({ bookId: clip.bookId, chapter: clip.chapter, verseStart: clip.verse });
    refBtn.textContent = `${refText}${clip.sourceTitle ? ` · ${clip.sourceTitle}` : ''}`;
    refBtn.addEventListener('click', () => {
      store.setCurrentBcv({ bookId: clip.bookId, chapter: clip.chapter, verse: clip.verse });
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', async () => {
      await userDataRepo.deleteClipping(clip.id);
      requestRefresh();
    });
    headRow.append(refBtn, delBtn);

    const quote = document.createElement('blockquote');
    quote.className = 'study-clip-quote';
    quote.textContent = clip.excerpt;

    card.append(headRow, quote);
    if (clip.comment) {
      const note = document.createElement('div');
      note.className = 'study-note-body';
      note.textContent = clip.comment;
      card.appendChild(note);
    }
    frag.appendChild(card);
  }
  body.appendChild(frag);
}

async function renderBackupView(body, { isStale, requestRefresh }) {
  const counts = await userDataRepo.getCounts();
  if (isStale()) return;

  const card = document.createElement('div');
  card.className = 'study-form-card';

  const summary = document.createElement('div');
  summary.className = 'muted-text';
  summary.textContent =
    `Banco isolado user_data.db: ${counts.highlights || 0} grifos · ${counts.notes || 0} notas · ` +
    `${counts.bookmarks || 0} marcadores · ${counts.clippings || 0} recortes.`;

  const pathInput = document.createElement('input');
  pathInput.type = 'text';
  pathInput.value = DEFAULT_BACKUP_PATH;

  const actions = document.createElement('div');
  actions.className = 'btn-row';

  const expBtn = document.createElement('button');
  expBtn.className = 'btn-primary';
  expBtn.textContent = 'Exportar JSON';
  expBtn.addEventListener('click', async () => {
    try {
      const res = await userDataRepo.exportBackup({ filePath: pathInput.value.trim(), writeFile: true });
      backupStatusMsg = `Backup salvo em ${res.path} (${res.counts.notes} notas, ${res.counts.highlights} grifos).`;
    } catch (err) {
      backupStatusMsg = `Erro ao exportar: ${err.message || err}`;
    }
    requestRefresh();
  });

  const impBtn = document.createElement('button');
  impBtn.className = 'btn-ghost';
  impBtn.textContent = 'Restaurar (Mesclar)';
  impBtn.addEventListener('click', async () => {
    try {
      const res = await userDataRepo.importBackup({ filePath: pathInput.value.trim(), replace: false });
      const c = res.imported || {};
      backupStatusMsg = `Restaurado: ${c.highlights || 0} grifos, ${c.notes || 0} notas, ${c.bookmarks || 0} marcadores.`;
    } catch (err) {
      backupStatusMsg = `Erro ao restaurar: ${err.message || err}`;
    }
    requestRefresh();
  });

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn-ghost';
  copyBtn.textContent = 'Copiar JSON';
  copyBtn.addEventListener('click', async () => {
    try {
      const res = await userDataRepo.exportBackup({ writeFile: false, includeJson: true });
      if (navigator.clipboard) await navigator.clipboard.writeText(res.json || '{}');
      backupStatusMsg = 'JSON completo copiado para a área de transferência.';
    } catch (err) {
      backupStatusMsg = `Erro ao copiar: ${err.message || err}`;
    }
    requestRefresh();
  });

  actions.append(expBtn, impBtn, copyBtn);
  card.append(summary, pathInput, actions);

  if (backupStatusMsg) {
    const st = document.createElement('p');
    st.className = 'ok-text';
    st.style.margin = '4px 0 0';
    st.textContent = backupStatusMsg;
    card.appendChild(st);
  }
  body.appendChild(card);
}

export const notesPanel = {
  openComposer(prefill = {}) {
    const cur = store.state.currentBcv;
    activeSubtab = 'notes';
    editingNote = {
      id: prefill.id || '',
      bookId: prefill.bookId || cur.bookId,
      chapter: prefill.chapter || cur.chapter,
      verseStart: prefill.verseStart || cur.verse || 1,
      verseEnd: prefill.verseEnd || prefill.verseStart || cur.verse || 1,
      title: prefill.title || '',
      body: prefill.body || '',
      tagsCsv: prefill.tagsCsv || ''
    };
  },

  async render(subbar, body, hooks) {
    subbar.innerHTML = '';
    body.innerHTML = '';
    renderSubtabBar(subbar, hooks.requestRefresh);

    if (activeSubtab === 'notes') await renderNotesView(body, hooks);
    else if (activeSubtab === 'bookmarks') await renderBookmarksView(body, hooks);
    else if (activeSubtab === 'clippings') await renderClippingsView(body, hooks);
    else if (activeSubtab === 'backup') await renderBackupView(body, hooks);
  }
};
