# Bíblia de Estudo Digital — Arquitetura Mestre

## 1. Alvo de Hardware e Sistema
- **Dispositivo exclusivo:** Lenovo Legion Y700 (1ª geração, TB-9707F)
- **Tela:** 8,8" IPS LCD (2560x1600, 16:10, 343 PPI, 120 Hz / 240 Hz toque)
- **Processamento:** Snapdragon 870, 8/12 GB RAM LPDDR5, UFS 3.1 + microSDXC
- **Sistema:** Android 11–13 (ZUI) — APK compilado via Capacitor + GitHub Actions

## 2. Regras Invioláveis de Engenharia
1. **Teto de tamanho:** Nenhum arquivo de código deve ultrapassar 300 linhas (alvo: 150–250).
2. **Desacoplamento:** Módulos em `js/features/`, `js/dashboards/` e `js/ai/` nunca importam uns aos outros; comunicam-se apenas via `js/core/events.js` e `js/core/store.js`.
3. **Armazenamento Híbrido:**
   - Módulos brutos (500+ arquivos, >600 MB, EPUB, PDF) ficam na pasta externa ou microSD (`OPEN_READONLY`, sem cópia).
   - Os 4 bancos de trabalho (`catalog.db`, `user_data.db`, `fts_index.db`, `exegetical_core.db`) ficam sempre no armazenamento interno UFS 3.1.
4. **Pool LRU Nativo:** Máximo de 14 módulos SQLite abertos simultaneamente via `BibleEnginePlugin.kt` (`requery/sqlite-android` com FTS5).
5. **120 FPS:** Animações restritas a `transform` e `opacity`; listas longas sempre virtualizadas.

## 3. Paleta IPS (Sem Preto Puro #000000)
- `paper` (Papel Quente): fundo `#F7F4EC` | texto `#1E1D1B` | destaque `#2D5A7B`
- `sepia` (Sépia Editorial): fundo `#EFE6D5` | texto `#2B231A` | destaque `#7A4E2D`
- `charcoal` (Carvão IPS): fundo `#1A1C20` | texto `#DAD8D2` | destaque `#7BAFD4`
- `night` (Noturno Suave): fundo `#121316` | texto `#BDBBB4` | destaque `#6C9BC2`

## 4. Chaves Canônicas Universais
- **BCV (Versículo/Intervalo):** `bookId` (1–66 + deuterocanônicos), `chapter`, `verseStart`, `verseEnd`.
- **Strong Normalizado:** `H0001`–`H8674` / `G0001`–`G5624` + lema Unicode.

## 5. Esquema Base dos 4 Bancos SQLite (UFS 3.1)
- **`catalog.db`**:
  - `modules(id, path, format, type, title, abbr, lang, size_bytes, has_strong, has_morph, indexed_fts, updated_at)`
  - `coverage_map(module_id, book_id, chapter_mask)`
  - `text_offsets(module_id, book_id, chapter, byte_start, byte_length)`
  - `module_sets(id, name, module_ids_json, sort_order)`
- **`user_data.db`**:
  - `annotations(id, target_type, target_ref, bcv_start, bcv_end, style, color, created_at)`
  - `notes(id, layer, title, body_md, target_ref, bcv_start, bcv_end, tags_json, updated_at)`
  - `research_stack(id, source_module, source_ref, excerpt, citation, created_at)`
  - `verse_lists(id, name, refs_json, updated_at)`
  - `workspaces(id, name, layout_json, link_sets_json)`
  - `ai_history(id, context_ref, mode, messages_json, updated_at)`
- **`fts_index.db`**: Tabelas virtuais FTS5 (`unicode61 remove_diacritics 2`) sob demanda.
- **`exegetical_core.db`**: Pacote CC BY 4.0 (STEPBible `TAGNT`/`TAHOT`/`TIPNR`, MACULA, OpenBible 340k).

## 6. Barramento de Eventos (`js/core/events.js`)
- `nav:goto` `{ bcv, linkSet }`
- `verse:selected` `{ bcv, moduleId, text }`
- `word:selected` `{ bcv, surface, lemma, strong, morph }`
- `library:scanned` `{ totalModules, durationMs }`
- `workspace:changed` `{ workspaceId }`
- `ai:ask` `{ prompt, mode, contextRef }`
- `ai:open-citation` `{ moduleId, ref }`
