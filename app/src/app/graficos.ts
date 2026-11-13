// Graficos genericos (SVG/HTML, sem biblioteca) da aba Minhas visoes: os rotulos
// vem prontos (qualquer campo, nao so mes). Mesmas regras do BI dos Indicadores:
// um eixo so, paleta categorica em ordem fixa (4 cores + cinza "Outros",
// validada para daltonismo em 05/11/2026), tooltip pelo atributo data-tip.

export const CAT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];
export const COR_OUTROS = '#6f7d8a';
export const MAX_SERIES = CAT.length;

export interface Serie {
  nome: string;
  cor: string;
  v: (number | null)[];
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const curto = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function teto(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  // degraus finos: 511 -> 600, nao 1000 (metade do grafico vazia)
  return ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((d) => n <= d) as number) * p;
}

function legenda(series: Serie[]): string {
  return series.length > 1 ? `<div class="legenda">${series.map((s) => `<span><i style="background:${s.cor}"></i>${esc(s.nome)}</span>`).join('')}</div>` : '';
}

function eixos(W: number, m: { e: number; d: number; t: number }, y: (v: number) => number, max: number, fmt: (v: number) => string): string {
  return [0, 0.25, 0.5, 0.75, 1]
    .map((f) => `<line x1="${m.e}" x2="${W - m.d}" y1="${y(max * f)}" y2="${y(max * f)}" class="g"/><text x="${m.e - 6}" y="${y(max * f) + 4}" class="eixo-y">${esc(fmt(max * f))}</text>`)
    .join('');
}

/** Colunas agrupadas ou empilhadas. largura = do desenho (menor = texto maior em card estreito) */
export function colunas(rot: string[], series: Serie[], empilhado: boolean, fmt: (v: number) => string, largura = 1000): string {
  const W = largura;
  const H = 300;
  const m = { e: 52, d: 8, t: 12, b: 34 };
  const pw = W - m.e - m.d;
  const ph = H - m.t - m.b;
  const tot = rot.map((_, i) => (empilhado ? series.reduce((s, x) => s + (x.v[i] || 0), 0) : Math.max(0, ...series.map((x) => x.v[i] || 0))));
  const max = teto(Math.max(1e-9, ...tot));
  const y = (v: number) => m.t + ph - (v / max) * ph;
  const bw = pw / Math.max(1, rot.length);
  const passo = Math.ceil(rot.length / 14);
  let marcas = '';
  rot.forEach((c, i) => {
    const x0 = m.e + i * bw;
    if (i % passo === 0) marcas += `<text x="${x0 + bw / 2}" y="${H - 12}" class="eixo-x">${esc(curto(c, Math.max(6, Math.floor((bw * passo) / 7))))}</text>`;
    if (empilhado) {
      let acc = 0;
      const larg = Math.max(4, bw * 0.62);
      series.forEach((s) => {
        const v = s.v[i] || 0;
        if (!v) return;
        const y1 = y(acc + v);
        marcas += `<rect x="${x0 + (bw - larg) / 2}" y="${y1}" width="${larg}" height="${Math.max(0, y(acc) - y1 - 2)}" rx="2" fill="${s.cor}" data-tip="${esc(c)} · ${esc(s.nome)}: ${esc(fmt(v))}"/>`;
        acc += v;
      });
    } else {
      const larg = Math.max(3, (bw * 0.72) / series.length);
      series.forEach((s, k) => {
        const v = s.v[i];
        if (v === null || v === undefined) return;
        const x = x0 + (bw - larg * series.length) / 2 + k * larg;
        marcas += `<rect x="${x + 1}" y="${y(v)}" width="${Math.max(1, larg - 2)}" height="${Math.max(0, y(0) - y(v))}" rx="2" fill="${s.cor}" data-tip="${esc(c)}${series.length > 1 ? ' · ' + esc(s.nome) : ''}: ${esc(fmt(v))}"/>`;
      });
    }
  });
  return `${legenda(series)}<svg viewBox="0 0 ${W} ${H}" class="grafico" role="img">${eixos(W, m, y, max, fmt)}${marcas}<line x1="${m.e}" x2="${W - m.d}" y1="${y(0)}" y2="${y(0)}" class="base"/></svg>`;
}

/** Linhas (2px) com marcadores e o ultimo valor rotulado */
export function linhas(rot: string[], series: Serie[], fmt: (v: number) => string): string {
  const W = 1000;
  const H = 300;
  const m = { e: 52, d: 16, t: 16, b: 34 };
  const pw = W - m.e - m.d;
  const ph = H - m.t - m.b;
  const max = teto(Math.max(1e-9, ...series.flatMap((s) => s.v.map((v) => v || 0))));
  const x = (i: number) => m.e + (rot.length <= 1 ? pw / 2 : (i * pw) / (rot.length - 1));
  const y = (v: number) => m.t + ph - (v / max) * ph;
  const passo = Math.ceil(rot.length / 14);
  const eixoX = rot.map((c, i) => (i % passo === 0 ? `<text x="${x(i)}" y="${H - 12}" class="eixo-x">${esc(curto(c, 12))}</text>` : '')).join('');
  const corpo = series
    .map((s) => {
      let d = '';
      s.v.forEach((v, i) => {
        if (v === null || v === undefined) return;
        d += (d && s.v[i - 1] !== null && s.v[i - 1] !== undefined ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1) + ' ';
      });
      const ult = s.v.reduce<number>((a, v, i) => (v !== null && v !== undefined ? i : a), -1);
      return (
        `<path d="${d}" fill="none" stroke="${s.cor}" stroke-width="2"/>` +
        s.v
          .map((v, i) =>
            v === null || v === undefined
              ? ''
              : `<circle cx="${x(i)}" cy="${y(v)}" r="4.5" class="ponto" style="fill:${s.cor}" data-tip="${esc(rot[i])}${series.length > 1 ? ' · ' + esc(s.nome) : ''}: ${esc(fmt(v))}"/>${i === ult && series.length <= 2 ? `<text x="${x(i) - 6}" y="${y(v) - 9}" class="rotulo" text-anchor="end">${esc(fmt(v))}</text>` : ''}`,
          )
          .join('')
      );
    })
    .join('');
  return `${legenda(series)}<svg viewBox="0 0 ${W} ${H}" class="grafico" role="img">${eixos(W, m, y, max, fmt)}${corpo}${eixoX}</svg>`;
}

/** Barras horizontais com rotulo e valor */
export function barras(itens: { rot: string; v: number; cor?: string; tip?: string }[], fmt: (v: number) => string): string {
  if (!itens.length) return '<p class="muted">Sem dados.</p>';
  const max = Math.max(1e-9, ...itens.map((i) => i.v));
  return `<div class="barras">${itens
    .map(
      (i) =>
        `<div class="barra" data-tip="${esc(i.tip || i.rot + ': ' + fmt(i.v))}"><span class="rot" title="${esc(i.rot)}">${esc(i.rot)}</span><span class="trilho"><span style="width:${(100 * Math.max(0, i.v)) / max}%;background:${i.cor || 'var(--accent)'}"></span></span><span class="val">${esc(fmt(i.v))}</span></div>`,
    )
    .join('')}</div>`;
}

/** Rosca: no maximo 4 fatias + Outros, com legenda e percentual */
export function rosca(itens: { rot: string; v: number; cor?: string }[], fmt: (v: number) => string): string {
  const pos = itens.filter((i) => i.v > 0).sort((a, b) => b.v - a.v);
  if (!pos.length) return '<p class="muted">Sem dados.</p>';
  // cor propria (semantica: prazo, etapa) = todas as fatias; senao 4 + Outros
  const proprias = pos.every((i) => i.cor);
  const n = proprias ? pos.length : MAX_SERIES;
  const top = pos.slice(0, n).map((i, k) => ({ ...i, cor: i.cor || CAT[k] }));
  const resto = pos.slice(n).reduce((s, i) => s + i.v, 0);
  if (resto > 0) top.push({ rot: 'Outros', v: resto, cor: COR_OUTROS });
  const tot = top.reduce((s, i) => s + i.v, 0);
  const R = 90;
  const r = 56;
  const cx = 110;
  const cy = 110;
  let a0 = -Math.PI / 2;
  const fatias = top
    .map((i) => {
      const a1 = a0 + (2 * Math.PI * i.v) / tot - (top.length > 1 ? 0.012 : 0);
      const grande = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a: number, rr: number) => `${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`;
      const d = top.length === 1 ? `M${cx - R},${cy} a${R},${R} 0 1,0 ${2 * R},0 a${R},${R} 0 1,0 ${-2 * R},0 M${cx - r},${cy} a${r},${r} 0 1,1 ${2 * r},0 a${r},${r} 0 1,1 ${-2 * r},0` : `M${p(a0, R)} A${R},${R} 0 ${grande} 1 ${p(a1, R)} L${p(a1, r)} A${r},${r} 0 ${grande} 0 ${p(a0, r)} Z`;
      a0 = a1 + (top.length > 1 ? 0.012 : 0);
      return `<path d="${d}" fill="${i.cor}" fill-rule="evenodd" data-tip="${esc(i.rot)}: ${esc(fmt(i.v))} (${Math.round((100 * i.v) / tot)}%)"/>`;
    })
    .join('');
  const leg = top.map((i) => `<div class="leg-l"><i style="background:${i.cor}"></i><span>${esc(i.rot)}</span><b>${esc(fmt(i.v))}</b><small class="muted">${Math.round((100 * i.v) / tot)}%</small></div>`).join('');
  return `<div class="rosca"><svg viewBox="0 0 220 220" class="grafico rosca-svg" role="img">${fatias}<text x="${cx}" y="${cy + 5}" text-anchor="middle" class="rotulo">${esc(fmt(tot))}</text></svg><div class="rosca-leg">${leg}</div></div>`;
}

/** Mapa de calor (um tom so, claro -> escuro) */
export function calor(lin: string[], col: string[], val: (i: number, j: number) => number | null, fmt: (v: number) => string, cel: (i: number, j: number) => string): string {
  let max = 1e-9;
  lin.forEach((_, i) => col.forEach((__, j) => (max = Math.max(max, val(i, j) || 0))));
  const cor = (v: number) => {
    const f = Math.sqrt(v / max);
    const a = [227, 238, 251];
    const b = [13, 61, 115];
    return `rgb(${a.map((x, k) => Math.round(x + (b[k] - x) * f)).join(',')})`;
  };
  const cab = `<tr><th></th>${col.map((c) => `<th class="dir">${esc(curto(c, 14))}</th>`).join('')}</tr>`;
  const corpo = lin
    .map(
      (l, i) =>
        `<tr class="sem-clique"><td class="quebra">${esc(l)}</td>${col
          .map((c, j) => {
            const v = val(i, j);
            return `<td class="cel" data-cel="${cel(i, j)}" style="background:${v ? cor(v) : 'transparent'};color:${v && v / max > 0.35 ? '#fff' : 'var(--fg)'}" data-tip="${esc(l)} · ${esc(c)}: ${v === null ? '–' : esc(fmt(v))}">${v ? esc(fmt(v)) : ''}</td>`;
          })
          .join('')}</tr>`,
    )
    .join('');
  return `<div class="tabela-wrap"><table class="calor"><thead>${cab}</thead><tbody>${corpo}</tbody></table></div>`;
}
