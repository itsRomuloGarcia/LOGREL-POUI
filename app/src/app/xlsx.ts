// Gera um .xlsx no navegador, sem biblioteca: cada aba e uma TABELA do Excel
// (ListObject, com filtro e listras), fonte Tahoma 10, como os relatorios da
// empresa (17/11/2026, Simular montagem). O arquivo e um zip "store" (sem
// compressao) com o minimo do Office Open XML: workbook, abas, tabelas,
// sharedStrings e estilos.

export type TipoCol = 'txt' | 'num' | 'data';
export interface ColXlsx {
  t: string;
  tipo?: TipoCol;
}
export interface AbaXlsx {
  /** nome da aba (ate 31 caracteres) */
  nome: string;
  /** nome da tabela do Excel: letras, numeros e _ (unico no arquivo) */
  tabela: string;
  colunas: ColXlsx[];
  /** valores na ordem das colunas; data = 'AAAA-MM-DD' */
  linhas: (string | number | null | undefined)[][];
}

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT = 'application/vnd.openxmlformats-officedocument';

// Remove caracteres que o XML nao aceita e escapa os especiais
const xml = (s: string) =>
  s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Letra da coluna (0 -> A, 26 -> AA) */
function letra(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** 'AAAA-MM-DD' -> numero de serie do Excel (dias desde 30/12/1899) */
function serieData(v: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  return (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000;
}

export function gerarXlsx(abas: AbaXlsx[]): Blob {
  const textos: string[] = [];
  const idxTexto = new Map<string, number>();
  const sst = (s: string) => {
    let i = idxTexto.get(s);
    if (i === undefined) {
      i = textos.length;
      textos.push(s);
      idxTexto.set(s, i);
    }
    return i;
  };

  const arquivos: [string, string][] = [];
  const abasXml = abas.map((aba, n) => {
    const nCol = aba.colunas.length;
    // Tabela do Excel precisa de pelo menos 1 linha de dados
    const linhas = aba.linhas.length ? aba.linhas : [aba.colunas.map((_, i) => (i === 0 ? '(nenhum)' : ''))];
    const larg = aba.colunas.map((c) => Math.max(8, c.t.length + 4));
    const celula = (v: unknown, c: number, r: number, tipo: TipoCol | undefined): string => {
      const ref = letra(c) + r;
      if (v === null || v === undefined || v === '') return '';
      if (tipo === 'data' && typeof v === 'string') {
        const d = serieData(v);
        if (d !== null) {
          larg[c] = Math.max(larg[c], 12);
          return `<c r="${ref}" s="1"><v>${d}</v></c>`;
        }
      }
      if (typeof v === 'number' && Number.isFinite(v)) {
        larg[c] = Math.max(larg[c], String(v).length + 3);
        return `<c r="${ref}"><v>${v}</v></c>`;
      }
      const s = String(v);
      larg[c] = Math.max(larg[c], Math.min(60, s.length + 2));
      return `<c r="${ref}" t="s"><v>${sst(s)}</v></c>`;
    };
    const cab = `<row r="1">${aba.colunas.map((c, i) => `<c r="${letra(i)}1" t="s"><v>${sst(c.t)}</v></c>`).join('')}</row>`;
    const corpo = linhas.map((l, j) => `<row r="${j + 2}">${aba.colunas.map((c, i) => celula(l[i], i, j + 2, c.tipo)).join('')}</row>`).join('');
    const ref = `A1:${letra(nCol - 1)}${linhas.length + 1}`;
    const cols = larg.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    arquivos.push([
      `xl/worksheets/sheet${n + 1}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="${NS}" xmlns:r="${NS_R}"><sheetViews><sheetView workbookViewId="0"${n === 0 ? ' tabSelected="1"' : ''}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="12.75"/><cols>${cols}</cols><sheetData>${cab}${corpo}</sheetData><tableParts count="1"><tablePart r:id="rId1"/></tableParts></worksheet>`,
    ]);
    arquivos.push([
      `xl/worksheets/_rels/sheet${n + 1}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${NS_PR}"><Relationship Id="rId1" Type="${NS_R}/table" Target="../tables/table${n + 1}.xml"/></Relationships>`,
    ]);
    arquivos.push([
      `xl/tables/table${n + 1}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<table xmlns="${NS}" id="${n + 1}" name="${aba.tabela}" displayName="${aba.tabela}" ref="${ref}" totalsRowShown="0"><autoFilter ref="${ref}"/><tableColumns count="${nCol}">${aba.colunas
        .map((c, i) => `<tableColumn id="${i + 1}" name="${xml(c.t)}"/>`)
        .join('')}</tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`,
    ]);
    return `<sheet name="${xml(aba.nome.slice(0, 31))}" sheetId="${n + 1}" r:id="rId${n + 1}"/>`;
  });

  const nAbas = abas.length;
  arquivos.push([
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="${NS}" xmlns:r="${NS_R}"><bookViews><workbookView/></bookViews><sheets>${abasXml.join('')}</sheets></workbook>`,
  ]);
  arquivos.push([
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${NS_PR}">${abas
      .map((_, n) => `<Relationship Id="rId${n + 1}" Type="${NS_R}/worksheet" Target="worksheets/sheet${n + 1}.xml"/>`)
      .join('')}<Relationship Id="rId${nAbas + 1}" Type="${NS_R}/styles" Target="styles.xml"/><Relationship Id="rId${nAbas + 2}" Type="${NS_R}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
  ]);
  // Tahoma 10; estilo 1 = data (formato 14, dd/mm/aaaa no Excel em portugues)
  arquivos.push([
    'xl/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="${NS}"><fonts count="1"><font><sz val="10"/><name val="Tahoma"/><family val="2"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
  ]);
  arquivos.push([
    'xl/sharedStrings.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="${NS}" count="${textos.length}" uniqueCount="${textos.length}">${textos.map((s) => `<si><t xml:space="preserve">${xml(s)}</t></si>`).join('')}</sst>`,
  ]);
  arquivos.push([
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${NS_PR}"><Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  ]);
  arquivos.push([
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${CT}.spreadsheetml.sheet.main+xml"/>${abas
      .map(
        (_, n) =>
          `<Override PartName="/xl/worksheets/sheet${n + 1}.xml" ContentType="${CT}.spreadsheetml.worksheet+xml"/><Override PartName="/xl/tables/table${n + 1}.xml" ContentType="${CT}.spreadsheetml.table+xml"/>`,
      )
      .join('')}<Override PartName="/xl/styles.xml" ContentType="${CT}.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="${CT}.spreadsheetml.sharedStrings+xml"/></Types>`,
  ]);
  // [Content_Types].xml primeiro no zip
  arquivos.unshift(arquivos.pop() as [string, string]);
  return new Blob([zipStore(arquivos)], { type: `${CT}.spreadsheetml.sheet` });
}

// ---------- zip sem compressao (metodo 0 = store) ----------
const TAB_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TAB_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(arquivos: [string, string][]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const agora = new Date();
  const hora = (agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1);
  const data = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let pos = 0;
  arquivos.forEach(([nome, conteudo]) => {
    const n = enc.encode(nome);
    const d = enc.encode(conteudo);
    const crc = crc32(d);
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true);
    loc.setUint16(4, 20, true);
    loc.setUint16(6, 0x0800, true); // nomes em UTF-8
    loc.setUint16(8, 0, true);
    loc.setUint16(10, hora, true);
    loc.setUint16(12, data, true);
    loc.setUint32(14, crc, true);
    loc.setUint32(18, d.length, true);
    loc.setUint32(22, d.length, true);
    loc.setUint16(26, n.length, true);
    loc.setUint16(28, 0, true);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true);
    cen.setUint16(12, hora, true);
    cen.setUint16(14, data, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, d.length, true);
    cen.setUint32(24, d.length, true);
    cen.setUint16(28, n.length, true);
    cen.setUint32(42, pos, true);
    partes.push(new Uint8Array(loc.buffer), n, d);
    central.push(new Uint8Array(cen.buffer), n);
    pos += 30 + n.length + d.length;
  });
  const tamCentral = central.reduce((s, b) => s + b.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamCentral, true);
  fim.setUint32(16, pos, true);
  const todas = [...partes, ...central, new Uint8Array(fim.buffer)];
  const saida = new Uint8Array(todas.reduce((s, b) => s + b.length, 0));
  let o = 0;
  todas.forEach((b) => {
    saida.set(b, o);
    o += b.length;
  });
  return saida;
}

/** Baixa o arquivo pelo navegador (link temporario) */
export function baixar(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
