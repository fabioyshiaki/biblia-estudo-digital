import { BOOKS, getBookById, parseReference } from '../core/canon.js';
import { store } from '../core/store.js';

const $ = (id) => document.getElementById(id);

let step = 'books';
let activeTestament = 'AT';
let pickedBookId = null;

function openModal() {
  const cur = store.state.currentBcv;
  const book = getBookById(cur.bookId);
  activeTestament = book ? book.testament : 'AT';
  pickedBookId = cur.bookId;
  step = 'books';

  $('nav-quick-input').value = '';
  $('nav-modal-backdrop').classList.remove('hidden');
  renderModal();
}

function closeModal() {
  $('nav-modal-backdrop').classList.add('hidden');
}

function renderTabs() {
  const row = $('nav-modal-tabs');
  row.innerHTML = '';

  if (step === 'chapters') {
    const book = getBookById(pickedBookId);
    const backBtn = document.createElement('button');
    backBtn.className = 'btn-ghost';
    backBtn.textContent = '← Livros';
    backBtn.addEventListener('click', () => {
      step = 'books';
      renderModal();
    });

    const label = document.createElement('span');
    label.style.fontWeight = '600';
    label.style.marginLeft = '8px';
    label.textContent = book ? `${book.name} — Escolha o capítulo` : 'Capítulo';

    row.append(backBtn, label);
    return;
  }

  for (const t of [
    ['AT', 'Antigo Testamento'],
    ['NT', 'Novo Testamento'],
    ['DC', 'Deuterocanônicos']
  ]) {
    const btn = document.createElement('button');
    btn.className = `chip ${activeTestament === t[0] ? 'active' : ''}`;
    btn.textContent = t[1];
    btn.addEventListener('click', () => {
      activeTestament = t[0];
      renderModal();
    });
    row.appendChild(btn);
  }
}

function renderModal() {
  renderTabs();
  const grid = $('nav-modal-grid');
  grid.innerHTML = '';

  if (step === 'books') {
    grid.classList.remove('numbers-grid');
    const curBookId = store.state.currentBcv.bookId;
    const list = BOOKS.filter((b) => b.testament === activeTestament);

    for (const book of list) {
      const btn = document.createElement('button');
      btn.className = `nav-cell ${book.id === curBookId ? 'active' : ''}`;
      btn.textContent = book.name;
      btn.addEventListener('click', () => {
        pickedBookId = book.id;
        if (book.chapters === 1) {
          store.setCurrentBcv({ bookId: book.id, chapter: 1, verse: 1 });
          closeModal();
        } else {
          step = 'chapters';
          renderModal();
        }
      });
      grid.appendChild(btn);
    }
    return;
  }

  grid.classList.add('numbers-grid');
  const book = getBookById(pickedBookId);
  if (!book) return;
  const cur = store.state.currentBcv;

  for (let ch = 1; ch <= book.chapters; ch++) {
    const btn = document.createElement('button');
    btn.className = `nav-cell ${cur.bookId === book.id && cur.chapter === ch ? 'active' : ''}`;
    btn.textContent = String(ch);
    btn.addEventListener('click', () => {
      store.setCurrentBcv({ bookId: book.id, chapter: ch, verse: 1 });
      closeModal();
    });
    grid.appendChild(btn);
  }
}

function handleQuickSubmit() {
  const input = $('nav-quick-input');
  const parsed = parseReference(input.value);
  if (!parsed) {
    input.style.borderColor = 'var(--warn)';
    setTimeout(() => { input.style.borderColor = ''; }, 900);
    return;
  }
  store.setCurrentBcv({
    bookId: parsed.bookId,
    chapter: parsed.chapter,
    verse: parsed.verseStart || 1
  });
  closeModal();
}

export const navSelector = {
  init() {
    $('btn-close-nav-modal').addEventListener('click', closeModal);
    $('nav-modal-backdrop').addEventListener('click', (e) => {
      if (e.target.id === 'nav-modal-backdrop') closeModal();
    });

    $('btn-nav-quick-go').addEventListener('click', handleQuickSubmit);
    $('nav-quick-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleQuickSubmit();
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openModal();
      } else if (e.key === 'Escape') {
        closeModal();
      }
    });
  },

  open: openModal,
  close: closeModal
};
