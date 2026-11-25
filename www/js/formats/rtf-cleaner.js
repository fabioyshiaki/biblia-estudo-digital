function decodeWin1252Hex(hex) {
  const code = parseInt(hex, 16);
  if (Number.isNaN(code)) return '';
  try {
    return new TextDecoder('windows-1252').decode(new Uint8Array([code]));
  } catch {
    return String.fromCharCode(code);
  }
}

export function isRtfContent(raw) {
  const s = String(raw || '').trimStart();
  return s.startsWith('{\\rtf') || s.startsWith('\\rtf');
}

export function rtfToHtml(raw) {
  if (!isRtfContent(raw)) return String(raw || '');

  let s = String(raw || '');

  // Remove grupos de cabeçalho que não são texto visível
  s = s.replace(/\{\\\*\\[^}]*\}/g, '');
  s = s.replace(/\{\\fonttbl[\s\S]*?\}\s*\}/g, '');
  s = s.replace(/\{\\colortbl[\s\S]*?\}/g, '');
  s = s.replace(/\{\\stylesheet[\s\S]*?\}\s*\}/g, '');
  s = s.replace(/\{\\info[\s\S]*?\}/g, '');

  // Quebras de linha e parágrafo
  s = s.replace(/\\par\b\s?/g, '\n\n');
  s = s.replace(/\\line\b\s?/g, '\n');
  s = s.replace(/\\tab\b\s?/g, '  ');

  // Caracteres Unicode (\uNNN?) e hexadecimais (\'e9 -> é)
  s = s.replace(/\\u(-?\d+)\??/g, (_, num) => {
    let code = parseInt(num, 10);
    if (code < 0) code += 65536;
    return String.fromCharCode(code);
  });
  s = s.replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => decodeWin1252Hex(hex));

  // Chaves escapadas
  s = s.replace(/\\([{}])/g, '$1');
  s = s.replace(/\\\\/g, '\\');

  // Remove demais comandos de controle RTF e chaves estruturais
  s = s.replace(/\\[a-zA-Z]+-?\d*\s?/g, '');
  s = s.replace(/[{}]/g, '');

  // Converte parágrafos limpos em HTML editorial
  const paragraphs = s
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, '<br />').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  return paragraphs.map((p) => `<p>${p}</p>`).join('');
}
