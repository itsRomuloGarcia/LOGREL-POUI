const tela1 = async (nome) => {
  const o = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(OUT, nome), Buffer.from(o.result.data, 'base64'));
  console.log('ok', nome);
};
await cmd('Page.enable');
await cmd('Runtime.enable');
await tela(1440, 1000);
await cmd('Page.navigate', { url: 'http://localhost:4298/' });
await ate(`document.querySelectorAll('.cartao').length > 5`, 90000);
await espera(1500);
// 6) Detalhe do pedido 004765 (pela Lista)
await clica('[data-tela="lista"]');
await espera(800);
await ev(`(()=>{const b=document.querySelector('#lg-busca'); b.value='004765'; b.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);
await espera(900);
await ev(`document.querySelector('[data-ped="5065"]').click(); true`);
await ate(`!!document.querySelector('.gaveta #lg-custos')`);
await espera(600);
await clica('#lg-hist summary');
await ate(`document.querySelectorAll('#lg-hist ul.hist li').length > 3`);
await ev(`(()=>{const g=document.querySelector('.gaveta'); g.style.position='absolute'; g.style.height='auto'; g.style.maxHeight='none'; const r=g.querySelector('.rolar'); r.style.overflow='visible'; r.style.maxHeight='none'; r.style.height='auto'; return true})()`);
await tela(1440, 5200);
await espera(800);
await faixa('06-detalhe.png', `document.querySelector('.gaveta')`, `document.querySelector('.gaveta header')`, `document.querySelector('#lg-custos').getBoundingClientRect().top - 6`, 0);
await shot('07-custos.png', '#lg-custos', 8);
await ev(`[...document.querySelectorAll('.gaveta h3')].find(h=>h.textContent.includes('Cliente e pedido')).parentElement.id='sec-cli'; [...document.querySelectorAll('.gaveta h3')].find(h=>h.textContent.trim()==='Itens').parentElement.id='sec-itens'; true`);
await faixa('08-cliente-itens.png', `document.querySelector('.gaveta')`, `document.querySelector('#lg-frete')`, `document.querySelector('#sec-itens').getBoundingClientRect().bottom + 4`, 8);
await shot('09-historico.png', '#lg-hist', 8);
// editar a cobranca divergente (formulario aberto)
await clica('[data-acao="custo-editar"][data-item="003"]');
await espera(500);
await shot('10-custo-editar.png', '#lg-custos', 8);
console.log('erros JS:', erros.length ? erros : 'nenhum');
ws.close(); chrome.kill(); process.exit(0);
