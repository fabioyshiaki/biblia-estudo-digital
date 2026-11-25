// Formato: [id, mybibleNum, testamento, nomePT, abbrPT, abbrEN, capitulos, aliases]
const RAW_BOOKS = [
  [1, 10, 'AT', 'Gênesis', 'Gn', 'Gen', 50, 'gn,gen,genesis,gênesis'],
  [2, 20, 'AT', 'Êxodo', 'Êx', 'Exod', 40, 'ex,êx,exo,exod,exodo,êxodo'],
  [3, 30, 'AT', 'Levítico', 'Lv', 'Lev', 27, 'lv,lev,levitico,levítico'],
  [4, 40, 'AT', 'Números', 'Nm', 'Num', 36, 'nm,num,numeros,números'],
  [5, 50, 'AT', 'Deuteronômio', 'Dt', 'Deut', 34, 'dt,deut,deuteronomio,deuteronômio'],
  [6, 60, 'AT', 'Josué', 'Js', 'Josh', 24, 'js,jos,josh,josue,josué'],
  [7, 70, 'AT', 'Juízes', 'Jz', 'Judg', 21, 'jz,jui,judg,juizes,juízes'],
  [8, 80, 'AT', 'Rute', 'Rt', 'Ruth', 4, 'rt,rut,ruth,rute'],
  [9, 90, 'AT', '1 Samuel', '1Sm', '1Sam', 31, '1sm,1sam,1samuel,i samuel'],
  [10, 100, 'AT', '2 Samuel', '2Sm', '2Sam', 24, '2sm,2sam,2samuel,ii samuel'],
  [11, 110, 'AT', '1 Reis', '1Rs', '1Kgs', 22, '1rs,1re,1kgs,1reis,i reis'],
  [12, 120, 'AT', '2 Reis', '2Rs', '2Kgs', 25, '2rs,2re,2kgs,2reis,ii reis'],
  [13, 130, 'AT', '1 Crônicas', '1Cr', '1Chr', 29, '1cr,1chr,1cronicas,1crônicas'],
  [14, 140, 'AT', '2 Crônicas', '2Cr', '2Chr', 36, '2cr,2chr,2cronicas,2crônicas'],
  [15, 150, 'AT', 'Esdras', 'Ed', 'Ezra', 10, 'ed,esd,ezr,ezra,esdras'],
  [16, 160, 'AT', 'Neemias', 'Ne', 'Neh', 13, 'ne,nee,neh,neemias'],
  [17, 190, 'AT', 'Ester', 'Et', 'Esth', 10, 'et,est,esth,ester'],
  [18, 220, 'AT', 'Jó', 'Jó', 'Job', 42, 'jo,jó,job'],
  [19, 230, 'AT', 'Salmos', 'Sl', 'Ps', 150, 'sl,sal,ps,psa,salmo,salmos'],
  [20, 240, 'AT', 'Provérbios', 'Pv', 'Prov', 31, 'pv,pro,prov,proverbios,provérbios'],
  [21, 250, 'AT', 'Eclesiastes', 'Ec', 'Eccl', 12, 'ec,ecl,eccl,eclesiastes'],
  [22, 260, 'AT', 'Cantares', 'Ct', 'Song', 8, 'ct,cnt,cant,song,cantares,canticos'],
  [23, 290, 'AT', 'Isaías', 'Is', 'Isa', 66, 'is,isa,isaias,isaías'],
  [24, 300, 'AT', 'Jeremias', 'Jr', 'Jer', 52, 'jr,jer,jeremias'],
  [25, 310, 'AT', 'Lamentações', 'Lm', 'Lam', 5, 'lm,lam,lamentacoes,lamentações'],
  [26, 330, 'AT', 'Ezequiel', 'Ez', 'Ezek', 48, 'ez,eze,ezek,ezequiel'],
  [27, 340, 'AT', 'Daniel', 'Dn', 'Dan', 12, 'dn,dan,daniel'],
  [28, 350, 'AT', 'Oséias', 'Os', 'Hos', 14, 'os,ose,hos,oseias,oséias'],
  [29, 360, 'AT', 'Joel', 'Jl', 'Joel', 3, 'jl,joe,joel'],
  [30, 370, 'AT', 'Amós', 'Am', 'Amos', 9, 'am,amo,amos,amós'],
  [31, 380, 'AT', 'Obadias', 'Ob', 'Obad', 1, 'ob,oba,obad,obadias'],
  [32, 390, 'AT', 'Jonas', 'Jn', 'Jonah', 4, 'jn,jon,jonah,jonas'],
  [33, 400, 'AT', 'Miquéias', 'Mq', 'Mic', 7, 'mq,miq,mic,miqueias,miquéias'],
  [34, 410, 'AT', 'Naum', 'Na', 'Nah', 3, 'na,nau,nah,naum'],
  [35, 420, 'AT', 'Habacuque', 'Hc', 'Hab', 3, 'hc,hab,habacuque'],
  [36, 430, 'AT', 'Sofonias', 'Sf', 'Zeph', 3, 'sf,sof,zeph,sofonias'],
  [37, 440, 'AT', 'Ageu', 'Ag', 'Hag', 2, 'ag,age,hag,ageu'],
  [38, 450, 'AT', 'Zacarias', 'Zc', 'Zech', 14, 'zc,zac,zech,zacarias'],
  [39, 460, 'AT', 'Malaquias', 'Ml', 'Mal', 4, 'ml,mal,malaquias'],
  [40, 470, 'NT', 'Mateus', 'Mt', 'Matt', 28, 'mt,mat,matt,mateus'],
  [41, 480, 'NT', 'Marcos', 'Mc', 'Mark', 16, 'mc,mr,mar,mark,marcos'],
  [42, 490, 'NT', 'Lucas', 'Lc', 'Luke', 24, 'lc,lu,luc,luke,lucas'],
  [43, 500, 'NT', 'João', 'Jo', 'John', 21, 'jo,joa,jhn,john,joao,joão'],
  [44, 510, 'NT', 'Atos', 'At', 'Acts', 28, 'at,act,acts,atos'],
  [45, 520, 'NT', 'Romanos', 'Rm', 'Rom', 16, 'rm,ro,rom,romanos'],
  [46, 530, 'NT', '1 Coríntios', '1Co', '1Cor', 16, '1co,1cor,1corintios,1coríntios'],
  [47, 540, 'NT', '2 Coríntios', '2Co', '2Cor', 13, '2co,2cor,2corintios,2coríntios'],
  [48, 550, 'NT', 'Gálatas', 'Gl', 'Gal', 6, 'gl,ga,gal,galatas,gálatas'],
  [49, 560, 'NT', 'Efésios', 'Ef', 'Eph', 6, 'ef,eph,efesios,efésios'],
  [50, 570, 'NT', 'Filipenses', 'Fp', 'Phil', 4, 'fp,fl,php,phil,filipenses'],
  [51, 580, 'NT', 'Colossenses', 'Cl', 'Col', 4, 'cl,col,colossenses'],
  [52, 590, 'NT', '1 Tessalonicenses', '1Ts', '1Thess', 5, '1ts,1te,1th,1thess,1tessalonicenses'],
  [53, 600, 'NT', '2 Tessalonicenses', '2Ts', '2Thess', 3, '2ts,2te,2th,2thess,2tessalonicenses'],
  [54, 610, 'NT', '1 Timóteo', '1Tm', '1Tim', 6, '1tm,1ti,1tim,1timoteo,1timóteo'],
  [55, 620, 'NT', '2 Timóteo', '2Tm', '2Tim', 4, '2tm,2ti,2tim,2timoteo,2timóteo'],
  [56, 630, 'NT', 'Tito', 'Tt', 'Titus', 3, 'tt,tit,titus,tito'],
  [57, 640, 'NT', 'Filemom', 'Fm', 'Phlm', 1, 'fm,flm,phm,phlm,filemom,filemon'],
  [58, 650, 'NT', 'Hebreus', 'Hb', 'Heb', 13, 'hb,he,heb,hebreus'],
  [59, 660, 'NT', 'Tiago', 'Tg', 'Jas', 5, 'tg,ti,jas,jam,tiago'],
  [60, 670, 'NT', '1 Pedro', '1Pe', '1Pet', 5, '1pe,1pd,1pt,1pet,1pedro'],
  [61, 680, 'NT', '2 Pedro', '2Pe', '2Pet', 3, '2pe,2pd,2pt,2pet,2pedro'],
  [62, 690, 'NT', '1 João', '1Jo', '1John', 5, '1jo,1jn,1john,1joao,1joão'],
  [63, 700, 'NT', '2 João', '2Jo', '2John', 1, '2jo,2jn,2john,2joao,2joão'],
  [64, 710, 'NT', '3 João', '3Jo', '3John', 1, '3jo,3jn,3john,3joao,3joão'],
  [65, 720, 'NT', 'Judas', 'Jd', 'Jude', 1, 'jd,jud,jude,judas'],
  [66, 730, 'NT', 'Apocalipse', 'Ap', 'Rev', 22, 'ap,apo,rev,apocalipse'],
  // Deuterocanônicos (suporte para módulos que incluam cânon estendido)
  [67, 170, 'DC', 'Tobias', 'Tb', 'Tob', 14, 'tb,tob,tobias,tobit'],
  [68, 180, 'DC', 'Judite', 'Jt', 'Jdt', 16, 'jt,jdt,judite,judith'],
  [69, 270, 'DC', 'Sabedoria', 'Sb', 'Wis', 19, 'sb,sab,wis,sabedoria'],
  [70, 280, 'DC', 'Eclesiástico', 'Eclo', 'Sir', 51, 'eclo,sir,sirac,eclesiastico,eclesiástico'],
  [71, 320, 'DC', 'Baruque', 'Br', 'Bar', 6, 'br,bar,baruque,baruch'],
  [72, 462, 'DC', '1 Macabeus', '1Mc', '1Macc', 16, '1mc,1mac,1macc,1macabeus'],
  [73, 464, 'DC', '2 Macabeus', '2Mc', '2Macc', 15, '2mc,2mac,2macc,2macabeus']
];

export const BOOKS = RAW_BOOKS.map(([id, mybibleNum, testament, name, abbr, abbrEn, chapters, aliases]) => ({
  id,
  mybibleNum,
  testament,
  name,
  abbr,
  abbrEn,
  chapters,
  aliases: aliases.split(',')
}));

const byId = new Map();
const byMyBible = new Map();
const byAlias = new Map();

function normalizeKey(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s.]+/g, '');
}

for (const book of BOOKS) {
  byId.set(book.id, book);
  byMyBible.set(book.mybibleNum, book);
  for (const alias of book.aliases) {
    const key = normalizeKey(alias);
    // "jo" sem acento prioriza João (43); "jó" com acento tratado antes
    if (!byAlias.has(key) || book.id === 43) {
      byAlias.set(key, book);
    }
  }
}

export function getBookById(id) {
  return byId.get(Number(id)) || null;
}

export function getBookByMyBibleNum(num) {
  return byMyBible.get(Number(num)) || null;
}

export function findBookByText(text) {
  const raw = String(text || '').trim().toLowerCase();
  if (raw === 'jó' || raw === 'job') return byId.get(18);
  return byAlias.get(normalizeKey(raw)) || null;
}

export function formatRef({ bookId, chapter, verseStart, verseEnd }) {
  const b = getBookById(bookId);
  const name = b ? b.abbr : `Livro ${bookId}`;
  if (!chapter) return name;
  if (!verseStart) return `${name} ${chapter}`;
  if (verseEnd && verseEnd > verseStart) return `${name} ${chapter}:${verseStart}-${verseEnd}`;
  return `${name} ${chapter}:${verseStart}`;
}

export function parseReference(input) {
  const clean = String(input || '').trim();
  const match = clean.match(/^([1-3]?\s*[A-Za-zÀ-ÿ]+)\.?\s*(\d+)(?:[:.,](\d+)(?:\s*-\s*(\d+))?)?$/);
  if (!match) return null;
  const book = findBookByText(match[1]);
  if (!book) return null;
  const chapter = Math.min(Math.max(1, parseInt(match[2], 10)), book.chapters);
  const verseStart = match[3] ? parseInt(match[3], 10) : null;
  const verseEnd = match[4] ? parseInt(match[4], 10) : verseStart;
  return { bookId: book.id, chapter, verseStart, verseEnd };
}
