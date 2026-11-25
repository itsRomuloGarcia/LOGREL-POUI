// Roteiro dos prints da versao de 25/11/2026 (junte com o base.mjs, como o README explica).
// Precisa da API falsa mock5.cjs (porta 3998) e do ng serve na porta 4298.
// Ajudantes (antes ficavam no roteiro de cada rodada)
const tela1 = async (nome) => {
  const o = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(OUT, nome), Buffer.from(o.result.data, 'base64'));
  console.log('ok', nome);
};
const abrir = async () => {
  await cmd('Page.enable');
  await cmd('Runtime.enable');
  await tela(1440, 1000);
  await cmd('Page.navigate', { url: 'http://localhost:4298/' });
  await ate(`document.querySelectorAll('.cartao').length > 5`, 90000);
  await espera(1500);
};
const fim = () => { console.log('erros JS:', erros.length ? erros : 'nenhum'); ws.close(); chrome.kill(); process.exit(0); };
// abre o detalhe do pedido pela Lista (fecha o anterior) e solta a gaveta para o print
let aberto = false;
const gaveta = async (ped, recno, alto = 6000) => {
  if (!aberto) { await abrir(); aberto = true; await clica('[data-tela="lista"]'); await espera(800); }
  if (await ev(`!!document.querySelector('.gaveta')`)) { await clica('.gaveta [data-acao="fechar"]'); await espera(600); }
  await tela(1440, 1000); await espera(400);
  await ev(`(()=>{const b=document.querySelector('#lg-busca'); b.value='${ped}'; b.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);
  await espera(900);
  await ev(`document.querySelector('[data-ped="${recno}"]').click(); true`);
  await ate(`!!document.querySelector('.gaveta #lg-form')`);
  await espera(800);
  await ev(`(()=>{const g=document.querySelector('.gaveta'); g.style.position='absolute'; g.style.height='auto'; g.style.maxHeight='none'; const r=g.querySelector('.rolar'); r.style.overflow='visible'; r.style.maxHeight='none'; r.style.height='auto'; return true})()`);
  await tela(1440, alto); await espera(800);
};
// marca a secao pelo texto do legend/h3 e devolve o seletor
const secao = async (txt, id) => { await ev(`(()=>{const e=[...document.querySelectorAll('.gaveta legend, .gaveta h3')].find(e=>e.textContent.trim().startsWith(${JSON.stringify(txt)})); if(!e) throw new Error('sem secao ${txt}'); (e.tagName==='LEGEND'?e.parentElement:e.parentElement).id='${id}'; return true})()`); return '#' + id; };
// confirmacoes do navegador (Fechar com cobranca aberta) sao aceitas
{ const orig = ws.onmessage; ws.onmessage = (m) => { orig(m); const o = JSON.parse(m.data); if (o.method === 'Page.javascriptDialogOpening') cmd('Page.handleJavaScriptDialog', { accept: true }); }; }
const clip = async (nome, r) => {
  const o = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } });
  writeFileSync(join(OUT, nome), Buffer.from(o.result.data, 'base64'));
  console.log('ok', nome, Math.round(r.w), 'x', Math.round(r.h));
};
const caixa = (expr) => ev(`(()=>{const b=(${expr}).getBoundingClientRect(); return {x:b.left+scrollX,y:b.top+scrollY,w:b.width,h:b.height}})()`);
const entre = async (nome, cont, topo, fimExpr, pad = 10) => {
  await ev(`(()=>{window.scrollTo(0,0); return true})()`);
  await espera(400);
  const c = await caixa(cont); const a = await caixa(topo); const b = await ev(`(${fimExpr})`);
  await clip(nome, { x: c.x, w: c.w, y: a.y - pad, h: b + scrollY0 - a.y + 2 * pad });
};
const scrollY0 = 0;

// ---- Quadros (6 colunas so acima de 1500 px)
await abrir();
await tela(1600, 1500); await espera(1200);
{
  const fimY = await ev(`(()=>{const q=document.querySelector('.quadros'); const c=q.querySelector('section .cartao:nth-of-type(2)') || q.querySelectorAll('.cartao')[1]; return Math.ceil(q.querySelector('section').querySelectorAll('.cartao')[1].getBoundingClientRect().bottom + 12)})()`);
  await clip('01-quadros.png', { x: 0, y: 0, w: 1596, h: fimY });
}
// ---- Programacao
await tela(1440, 1600);
await clica('[data-tela="programacao"]'); await espera(1200);
{
  const t = await caixa(`document.querySelector('#lg-conteudo')`);
  await clip('02-programacao.png', { x: 0, y: t.y, w: 1428, h: 830 });
}
await tela(1440, 2600); await espera(600);
await shot('02b-entregas-hoje.png', '#kb-ent', 0);
// ---- Lista
await tela(1440, 1400);
await clica('[data-tela="lista"]'); await espera(1200);
{
  const t = await caixa(`document.querySelector('#lg-conteudo')`);
  await clip('04-lista.png', { x: 0, y: t.y, w: 1428, h: 553 });
}
// ---- Exportar XLSX
await clica('[data-acao="xlsx"]'); await espera(900);
await shot('05-exportar-xlsx.png', '.modal', 0);
await clica('[data-acao="fechar-modal"]'); await espera(500);
// ---- Indicadores
await tela(1440, 5000);
await clica('[data-tela="indicadores"]'); await espera(1800);
console.log(await ev(`[...document.querySelectorAll('#lg-conteudo h2, #lg-conteudo h3')].map(h=>h.textContent.trim().slice(0,50)+'@'+Math.round(h.getBoundingClientRect().top)).join(' | ')`));
{
  const t = await caixa(`document.querySelector('#lg-conteudo')`);
  await clip('06-indicadores.png', { x: 0, y: t.y, w: 1428, h: 793 });
  await ev(`(()=>{const h=[...document.querySelectorAll('#lg-conteudo h2')].find(h=>h.textContent.startsWith('Custo do CTE')); h.closest('section.painel').id='g-cobrado'; return true})()`);
  await shot('07-custo-x-cobrado.png', '#g-cobrado', 0);
}
// ---- Detalhe do pedido 004765 (reentrega, custos, historico)
await tela(1440, 1000);
await clica('[data-tela="lista"]'); await espera(800);
aberto = true;
await gaveta('004765', 5065);
const gav = `document.querySelector('.gaveta')`;
await secao('Custos de frete', 's-custos');
await entre('03a-detalhe.png', gav, `document.querySelector('.gaveta header')`, `document.querySelector('#s-custos').getBoundingClientRect().top - 6`, 0);
await shot('03b-custos.png', '#lg-custos', 8);
await secao('Itens', 's-itens');
await entre('03e-cliente-itens.png', gav, `document.querySelector('#lg-frete')`, `document.querySelector('#s-itens').getBoundingClientRect().bottom + 4`, 8);
await clica('#lg-hist summary');
await ate(`document.querySelectorAll('#lg-hist ul.hist li').length > 3`);
await espera(400);
await shot('03d-historico.png', '#lg-hist', 8);
await clica('[data-acao="custo-editar"][data-item="003"]'); await espera(500);
await shot('03c-custo-editar.png', '#lg-custos', 8);
await clica('[data-acao="custo-cancelar"]'); await espera(400);
// ---- Envios parciais: 004720 (1a NF entregue, 2a em transito)
await gaveta('004720', 5020);
await secao('Envio e entrega', 's-env1');
await entre('03f-envios.png', gav, `document.querySelector('#s-env1')`, `document.querySelector('#lg-custos').getBoundingClientRect().bottom + 2`, 8);
// ---- Sem CTE: 004760
await gaveta('004760', 5060);
await clica('[data-acao="custo-editar"][data-item="001"]'); await espera(500);
await shot('03g-sem-cte.png', '#lg-custos', 8);
await clica('[data-acao="custo-cancelar"]'); await espera(400);
// ---- Finalizar sem entrega: 004777 (extravio, reembolso pendente)
await gaveta('004777', 5077);
await secao('Finalizar sem entrega', 's-fin');
await entre('03h-finalizar.png', gav, `document.querySelector('#s-fin')`, `(()=>{const a=document.querySelector('#lg-avisos'); const f=document.querySelector('#s-fin').getBoundingClientRect().bottom; return a && a.getBoundingClientRect().height ? Math.max(f, a.getBoundingClientRect().bottom) : f})()`, 8);
fim();
