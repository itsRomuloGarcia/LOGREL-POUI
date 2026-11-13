import { Opcao, PedidoEdicao } from './log.service';

// Importacao em massa (planilha -> pedidos): leitura do texto colado do Excel
// (tabulacao) ou de um CSV (; ou ,), reconhecimento das colunas pelo titulo e
// conversao dos valores. A gravacao usa o mesmo PUT da edicao de um pedido.

export type Destino = keyof PedidoEdicao | 'pedido' | '';

/** Ordem = ordem do modelo de planilha */
export const DESTINOS: [Destino, string][] = [
  ['', '(ignorar)'],
  ['pedido', 'Pedido'],
  ['previsaoSaida', 'Data de saída (C5_FECENT)'],
  ['dataEnvio', 'Data de envio'],
  ['dataPrevisao', 'Previsão de entrega'],
  ['dataEntrega', 'Data de entrega'],
  ['tipoMaterial', 'Tipo de material'],
  ['cte', 'CTE'],
  ['valorCte', 'Valor do CTE'],
  ['reentrega', 'Gerou reentrega'],
  ['cteReentrega', 'CTE da reentrega'],
  ['valorCteReentrega', 'Valor do CTE da reentrega'],
  ['dataNovaEntrega', 'Nova data de entrega'],
  ['indicador', 'Indicador de atraso'],
  ['dataRetorno', 'Data do retorno'],
  ['motivoRetorno', 'Motivo do retorno'],
  ['pedidoReenvio', 'Pedido do reenvio'],
  ['transportadora', 'Transportadora'],
  ['frete', 'Frete destacado'],
  ['volume', 'Volume'],
  ['freteNaoDestacado', 'Frete não destacado'],
];

/** Campos que a planilha atualiza (definido pelo usuario em 13/11/2026; CTE da
 *  reentrega incluido na 2a rodada). Os outros (nova data da reentrega,
 *  transportadora, frete, volume e frete nao destacado) so pela gaveta: a coluna
 *  com esse titulo e ignorada. A nova data sai da data de entrega (painel.ts). */
const DA_PLANILHA = new Set<Destino>(['pedido', 'dataEnvio', 'dataPrevisao', 'dataEntrega', 'tipoMaterial', 'cte', 'valorCte', 'reentrega', 'cteReentrega', 'valorCteReentrega', 'indicador']);

/** Opcoes da importacao (ordem = ordem do modelo de planilha) */
export const DESTINOS_IMP = DESTINOS.filter(([d]) => !d || DA_PLANILHA.has(d));

const norm = (s: string) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const tem = (n: string, ...p: string[]) => p.every((x) => new RegExp(`\\b${x}`).test(n));

/** Titulo da coluna -> campo. A ordem importa: o mais especifico primeiro */
const REGRAS: [Destino, (n: string) => boolean][] = [
  ['valorCteReentrega', (n) => (tem(n, 'valor') || tem(n, 'vlr') || tem(n, 'custo')) && tem(n, 'cte') && tem(n, 'reent')],
  ['cteReentrega', (n) => tem(n, 'cte') && tem(n, 'reent')],
  ['dataNovaEntrega', (n) => tem(n, 'nova') && tem(n, 'entrega')],
  ['reentrega', (n) => tem(n, 'reent')],
  ['valorCte', (n) => (tem(n, 'valor') || tem(n, 'vlr') || tem(n, 'custo')) && (tem(n, 'cte') || tem(n, 'conhecimento'))],
  ['cte', (n) => tem(n, 'cte') || tem(n, 'conhecimento')],
  ['freteNaoDestacado', (n) => tem(n, 'frete') && (tem(n, 'nao') || /\bn\b/.test(n)) && tem(n, 'destac')],
  ['frete', (n) => tem(n, 'frete')],
  ['dataPrevisao', (n) => tem(n, 'prev')], // "Prev. Entrega" (planilha da logistica) e "Previsao"
  ['dataEntrega', (n) => tem(n, 'entreg')],
  ['dataEnvio', (n) => tem(n, 'envi') || tem(n, 'saida') || tem(n, 'expedi') || tem(n, 'embarque')],
  ['tipoMaterial', (n) => tem(n, 'material')],
  ['indicador', (n) => tem(n, 'indicador') || tem(n, 'motivo') || tem(n, 'atraso')],
  ['transportadora', (n) => tem(n, 'transp')],
  ['volume', (n) => tem(n, 'volume') || n === 'vol'],
  ['pedido', (n) => tem(n, 'pedido') || tem(n, 'pv') || n === 'num' || n === 'numero'],
];

/** Uma coluna por campo: a primeira que casar fica com ele. As regras dos campos
 *  fora da planilha continuam para "segurar" o titulo ("CTE da reentrega" nao
 *  pode cair em "Gerou reentrega", nem "Nova data de entrega" em "Data de entrega") */
export function autoMapa(cab: string[]): Destino[] {
  const usados = new Set<Destino>();
  return cab.map((c) => {
    const n = norm(c);
    const achou = REGRAS.find(([d, f]) => !usados.has(d) && f(n));
    if (!achou || !DA_PLANILHA.has(achou[0])) return '';
    usados.add(achou[0]);
    return achou[0];
  });
}

/** Texto colado (tabulacao) ou CSV (; ou ,) -> linhas x celulas, com aspas */
export function lerTabela(texto: string): string[][] {
  const txt = texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const primeira = txt.split('\n').find((l) => l.trim()) || '';
  const sep = primeira.includes('\t') ? '\t' : primeira.includes(';') ? ';' : ',';
  const out: string[][] = [];
  let lin: string[] = [];
  let cel = '';
  let aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (aspas) {
      if (c === '"') {
        if (txt[i + 1] === '"') {
          cel += '"';
          i++;
        } else aspas = false;
      } else cel += c;
    } else if (c === '"' && cel === '') aspas = true;
    else if (c === sep) {
      lin.push(cel);
      cel = '';
    } else if (c === '\n') {
      lin.push(cel);
      out.push(lin);
      lin = [];
      cel = '';
    } else cel += c;
  }
  if (cel || lin.length) {
    lin.push(cel);
    out.push(lin);
  }
  return out.map((l) => l.map((c) => c.trim())).filter((l) => l.some((c) => c));
}

/** Arquivo -> texto: UTF-8 ou, se nao for, Windows-1252 (CSV salvo pelo Excel em portugues) */
export async function lerArquivo(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

/** "1.234,56", "1234.56", "1.234", "R$ 150" -> numero (NaN se invalido; vazio = 0) */
export function numBR(s: string): number {
  let v = String(s ?? '').replace(/R\$|\s/gi, '');
  if (!v) return 0;
  if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '');
  return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : NaN;
}

/** dd/mm/aaaa, dd/mm/aa, aaaa-mm-dd, aaaammdd ou numero de serie do Excel -> AAAA-MM-DD ('' vazio, null invalida) */
export function dataIso(s: string): string | null {
  const v = String(s ?? '').trim();
  if (!v) return '';
  let a = 0;
  let m = 0;
  let d = 0;
  let r: RegExpMatchArray | null;
  if ((r = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/))) {
    d = +r[1];
    m = +r[2];
    a = r[3].length === 2 ? 2000 + +r[3] : +r[3];
  } else if ((r = v.match(/^(\d{4})-(\d{2})-(\d{2})/))) {
    a = +r[1];
    m = +r[2];
    d = +r[3];
  } else if ((r = v.match(/^(\d{4})(\d{2})(\d{2})$/))) {
    a = +r[1];
    m = +r[2];
    d = +r[3];
  } else if (/^\d{5}([.,]\d+)?$/.test(v)) {
    const dt = new Date(1899, 11, 30 + Math.floor(Number(v.replace(',', '.'))));
    a = dt.getFullYear();
    m = dt.getMonth() + 1;
    d = dt.getDate();
  } else return null;
  const dt = new Date(a, m - 1, d);
  if (dt.getFullYear() !== a || dt.getMonth() !== m - 1 || dt.getDate() !== d || a < 2000 || a > 2100) return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Marcadores de "sem valor" da planilha da logistica ("--", "-", "Nao atende") = celula vazia */
export function semValor(s: string): boolean {
  const v = String(s ?? '').trim();
  return /^[-–—_.\s]+$/.test(v) || ['nao atende', 'n a', 'sem', 'nao tem', 'nao possui', 'nao ha'].includes(norm(v));
}

/** Numero do pedido: a planilha perde os zeros a esquerda (3258 -> 003258); "2604." -> 002604 */
export function numPedido(s: string): string {
  const v = String(s ?? '').trim().toUpperCase().replace(/^(\d+)[.,]$/, '$1');
  return /^\d+$/.test(v) ? v.padStart(6, '0') : v;
}

/** Codigo ou descricao do combo -> codigo (null = nao achou) */
export function opcaoDe(ops: Opcao[], s: string): string | null {
  const v = String(s ?? '').trim();
  if (!v) return '';
  const cod = ops.find(([c]) => c.toUpperCase() === v.toUpperCase());
  if (cod) return cod[0];
  // "D - Pedestal" (como a tela mostra): vale o codigo antes do traco
  const tr = v.match(/^(\S+)\s+-\s+.+$/);
  const codTr = tr ? ops.find(([c]) => c.toUpperCase() === tr[1].toUpperCase()) : undefined;
  if (codTr) return codTr[0];
  // so a descricao (inteira ou o comeco, com 3 letras ou mais)
  const n = norm(v);
  const desc = ops.find(([, t]) => norm(t) === n) || ops.find(([, t]) => norm(t).startsWith(n) && n.length >= 3);
  if (desc) return desc[0];
  // pelas palavras, sem "de/do/da...": "Atraso logistica transportadora" acha
  // "Atraso transportadora"; "Ausencia do destinatario" acha "Ausencia destinatario".
  // Vale so se uma opcao casar.
  const pal = (s: string) => new Set(norm(s).split(' ').filter((x) => x.length > 2 || /\d/.test(x)));
  const pv = pal(v);
  const contem = (a: Set<string>, b: Set<string>) => b.size > 0 && [...b].every((x) => a.has(x));
  const cands = ops.filter(([, t]) => {
    const pt = pal(t);
    return contem(pv, pt) || contem(pt, pv);
  });
  return cands.length === 1 ? cands[0][0] : null;
}

/** Sim/Nao -> 'S' / 'N' ('' vazio, null invalido) */
export function simNao(s: string): string | null {
  const v = norm(s);
  if (!v) return '';
  if (['s', 'sim', '1', 'x', 'true', 'yes'].includes(v)) return 'S';
  if (['n', 'nao', '0', 'false', 'no'].includes(v)) return 'N';
  return null;
}

/** Baixa um texto como arquivo (CSV com BOM, para o Excel abrir com acento) */
export function baixar(nome: string, texto: string): void {
  const url = URL.createObjectURL(new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function celulaCsv(v: string | number): string {
  const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '');
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
