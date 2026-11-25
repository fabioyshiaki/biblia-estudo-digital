function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function normalizeStrongCode(raw) {
  const clean = String(raw || '').trim().toUpperCase();
  const match = clean.match(/^([GH])0*(\d+)$/);
  if (!match) return clean;
  return `${match[1]}${match[2]}`;
}

function convertMySwordTags(raw) {
  let html = String(raw || '');

  // Títulos de seção internos (<TS>...</Ts>)
  html = html.replace(/<TS\d?>(.*?)<\/Ts>/gi, '<span class="v-subheading">$1</span>');

  // Palavras de Jesus (<FR>...</Fr>) e itálico de tradução (<FI>...</Fi>)
  html = html.replace(/<FR>(.*?)<\/Fr>/gi, '<span class="v-woj">$1</span>');
  html = html.replace(/<FI>(.*?)<\/Fi>/gi, '<em class="v-added">$1</em>');

  // Notas de rodapé (<RF>...</Rf>) viram botão discreto com texto em data-note
  html = html.replace(/<RF(?:\s+q=[^>]*)?>(.*?)<\/Rf>/gi, (_, note) => {
    const plain = note.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return `<button type="button" class="v-fn" data-note="${escapeHtml(plain)}">*</button>`;
  });

  // Referências cruzadas (<RX 43.3.16>)
  html = html.replace(/<RX\s+([^>]+)>/gi, (_, ref) => {
    return `<button type="button" class="v-xref" data-ref="${escapeHtml(ref.trim())}">↗</button>`;
  });

  // Códigos Strong (<WG26>, <WH430>) e Morfologia (<WT...>)
  html = html.replace(/<W([GH]\d+)>/gi, (_, code) => {
    const norm = normalizeStrongCode(code);
    return `<button type="button" class="v-strong" data-strong="${norm}">${norm}</button>`;
  });
  html = html.replace(/<WT([^>]+)>/gi, (_, morph) => {
    const clean = morph.trim();
    return `<button type="button" class="v-morph" data-morph="${escapeHtml(clean)}">${escapeHtml(clean)}</button>`;
  });

  // Quebras de parágrafo (<CM>, <CL>, <PI>)
  html = html.replace(/<(CM|CL|PI\d?)>/gi, '<br />');

  return html;
}

function convertMyBibleTags(raw) {
  let html = String(raw || '');

  // Palavras de Jesus (<J>...</J>) e itálico (<n>...</n>)
  html = html.replace(/<J>(.*?)<\/J>/gi, '<span class="v-woj">$1</span>');
  html = html.replace(/<n>(.*?)<\/n>/gi, '<em class="v-added">$1</em>');

  // Notas (<f>...</f>)
  html = html.replace(/<f>(.*?)<\/f>/gi, (_, note) => {
    const plain = note.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return `<button type="button" class="v-fn" data-note="${escapeHtml(plain)}">*</button>`;
  });

  // Strong (<S>G26</S>) e Morfologia (<m>V-AAI-3S</m>)
  html = html.replace(/<S>([^<]+)<\/S>/gi, (_, code) => {
    const norm = normalizeStrongCode(code);
    return `<button type="button" class="v-strong" data-strong="${norm}">${norm}</button>`;
  });
  html = html.replace(/<m>([^<]+)<\/m>/gi, (_, morph) => {
    const clean = morph.trim();
    return `<button type="button" class="v-morph" data-morph="${escapeHtml(clean)}">${escapeHtml(clean)}</button>`;
  });

  return html;
}

function stripDangerousAndLegacy(html) {
  let out = String(html || '');
  // Remove scripts, estilos embutidos e manipuladores inline
  out = out.replace(/<script[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<style[\s\S]*?<\/style>/gi, '');
  out = out.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Remove atributos legados que destroem o modo escuro/sépia
  out = out.replace(/\s(style|color|bgcolor|face|size)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  out = out.replace(/<\/?font[^>]*>/gi, '');

  // Garante lazy loading em imagens de comentários/livros
  out = out.replace(/<img\b/gi, '<img loading="lazy"');
  return out.trim();
}

export function sanitizeVerseHtml(raw, format = 'mysword') {
  const converted = format === 'mybible'
    ? convertMyBibleTags(raw)
    : convertMySwordTags(raw);
  return stripDangerousAndLegacy(converted);
}

export function sanitizeArticleHtml(raw, format = 'mysword') {
  const converted = format === 'mybible'
    ? convertMyBibleTags(raw)
    : convertMySwordTags(raw);
  return stripDangerousAndLegacy(converted);
}
