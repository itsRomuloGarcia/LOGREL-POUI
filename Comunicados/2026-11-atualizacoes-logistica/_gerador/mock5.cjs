// API falsa do LOGREL para os prints do comunicado (dados ficticios, deterministicos)
// mock5 (25/11/2026): mock2 + endereco, mensagem da nota, envios parciais (ZLE), tipo do frete,
// Sem CTE, finalizado sem entrega e indicador Outros (API 2026-11-25b)
const http = require('http');
let semente = 7;
const rnd = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const hoje = new Date(2026, 10, 25);
const d = (n) => { const x = new Date(hoje); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const TR = [['000101', 'RODOVIARIO ALFA'], ['000102', 'EXPRESSO BETA'], ['000103', 'TRANSPORTES GAMA'], ['000104', 'LOG DELTA CARGAS']];
const CLI = [
  ['SUPERMERCADO PRIMAVERA', 'Campinas', 'SP', '(19) 3241-5500'], ['REDE FARMA BEM', 'Curitiba', 'PR', '(41) 3322-1900'], ['LOJAS HORIZONTE', 'Recife', 'PE', '(81) 3456-7788'],
  ['CINEMA ESTRELA', 'Goiânia', 'GO', '(62) 3214-6060'], ['AUTO POSTO RIO AZUL', 'Belo Horizonte', 'MG', '(31) 3555-1212'], ['ESTACIONAMENTO CENTRO', 'São Paulo', 'SP', '(11) 3061-4400'],
  ['PREFEITURA DE VALE VERDE', 'Joinville', 'SC', '(47) 3433-2000'], ['HOSPITAL SANTA LUZ', 'Salvador', 'BA', '(71) 3333-9000'], ['FAST FOOD SABOR', 'Porto Alegre', 'RS', '(51) 3219-8800'],
  ['ACADEMIA MOVIMENTO', 'Fortaleza', 'CE', ''], ['RESTAURANTE BOA MESA', 'Brasília', 'DF', '(61) 3322-4545'], ['PARQUE AVENTURA', 'Manaus', 'AM', '(92) 3633-1010'],
];
const MOD = [['27PA0010', 'TOTEM AUTOATENDIMENTO 27 POL', 'T', 9800], ['21TT0005', 'TERMINAL TOUCH 21,5 PEDESTAL', 'T', 7600], ['15ND0003', 'TERMINAL ON DESK 15,6', 'T', 5200], ['IMP80TER', 'IMPRESSORA TERMICA 80MM', 'P', 1150], ['LEITQR02', 'LEITOR QR CODE', 'P', 640], ['CAT0001', 'CATRACA PEDESTAL INOX', 'C', 6900]];
const pedidos = [];
let num = 4700, rec = 5000;
// [qtd, etapa, diasEmissao]
const plano = [];
for (let i = 0; i < 70; i++) plano.push('ent');
for (let i = 0; i < 9; i++) plano.push('env');
for (let i = 0; i < 7; i++) plano.push('fat');
for (let i = 0; i < 10; i++) plano.push('prev');
plano.push('ret');
plano.forEach((et, i) => {
  const c = CLI[i % CLI.length];
  const t = TR[Math.floor(rnd() * TR.length)];
  const m = pick(MOD);
  const q = m[2] === 'P' ? 1 + Math.floor(rnd() * 6) : 1 + Math.floor(rnd() * 3);
  let emis, fat = '', env = '', prev = '', ent = '', saida = '';
  if (et === 'ent') {
    // entregues de junho a novembro
    const back = 10 + Math.floor((i / 70) * 160);
    emis = d(-back - 12); fat = d(-back - 3); env = d(-back - 2); saida = env;
    const lead = 2 + Math.floor(rnd() * 6);
    prev = d(-back - 2 + lead);
    const atraso = rnd() < 0.18 ? 1 + Math.floor(rnd() * 5) : -Math.floor(rnd() * 2);
    ent = d(-back - 2 + lead + atraso);
    if (ent > d(0)) ent = d(0);
  } else if (et === 'env') {
    const k = i - 70;
    emis = d(-15 - k); fat = d(-6 - (k % 4)); env = d(-4 + (k % 4)); saida = env;
    prev = k === 0 || k === 3 ? d(0) : k === 1 ? d(-2) : d(1 + k);
  } else if (et === 'fat') {
    const k = i - 79;
    emis = d(-10 - k); fat = d(-1 - (k % 3)); saida = k < 3 ? d(0) : k < 5 ? d(1) : k === 5 ? d(-1) : '';
  } else if (et === 'prev') {
    const k = i - 86;
    emis = d(-6 - k); saida = k < 2 ? d(0) : k < 4 ? d(1) : k < 6 ? d(4) : k === 6 ? d(8) : '';
  } else {
    emis = d(-40); fat = d(-30); env = d(-29); prev = d(-25); saida = env;
  }
  const nf = fat ? String(9100 + i).padStart(9, '0') : '';
  const pedido = String(num++).padStart(6, '0');
  const series = m[2] === 'T' ? Array.from({ length: q }, (_, k) => ['VS' + pedido.slice(2) + String(k + 1).padStart(2, '0'), nf]) : [];
  const reent = et === 'ent' && i % 17 === 5;
  pedidos.push({
    recno: rec++, pedido, emissao: emis, tipoNf: 'N', cliente: String(2000 + (i % CLI.length)).padStart(6, '0'), loja: '01', nome: c[0] + ' LTDA', fantasia: c[0], grupo: i % 3 ? 'VAREJO' : 'SERVIÇOS',
    clienteEntrega: String(2000 + (i % CLI.length)).padStart(6, '0') + '/01', nomeEntrega: c[0] + ' LTDA', cidade: c[1], uf: c[2], telefone: c[3], telefoneCliente: '',
    vendedor: pick(['ANA SOUZA', 'BRUNO LIMA', 'CARLA DIAS']), codVendedor: '000001', tipoPedido: pick(['VEN', 'VEN', 'LOC']),
    previsaoSaida: saida, transportadora: t[0], transportadoraNome: t[1], frete: Math.round((150 + rnd() * 900) * 100) / 100, freteNaoDestacadoTexto: '', freteNaoDestacado: 0,
    volume: q, especie: fat || saida ? 'CAIXA' : '', pesoLiquido: fat || saida ? q * 28 : 0, pesoBruto: fat || saida ? q * 32 : 0,
    dataEnvio: env, dataPrevisao: prev, dataEntrega: reent ? d(-30) : ent, tipoMaterial: m[2], cte: '', valorCte: 0,
    reentrega: reent ? 'SIM' : 'NAO', cteReentrega: '', valorCteReentrega: 0, dataNovaEntrega: reent ? ent : '', indicador: ent && ent > prev ? pick(['1', '2', '3', '4']) : '',
    dataRetorno: et === 'ret' ? d(-20) : '', motivoRetorno: et === 'ret' ? '2' : '', pedidoReenvio: '', obsEntrega: i === 72 ? 'Recebimento das 8h às 17h, falar com a portaria.' : '',
    itens: [{ item: '01', produto: m[0], descricao: m[1], quantidade: q, entregue: fat ? q : 0, valor: m[3] * q, tes: '501', descTes: 'VENDA DE PRODUCAO', nota: nf, serie: '1', dataFat: fat, numerosSerie: series }],
    notas: nf ? [nf] : [], dataFaturamento: fat, custos: [],
  });
});
const hist = {};
const H = (ped, h) => (hist[ped] = hist[ped] || []).unshift({ data: d(0), hora: '09:00:00', codUsuario: '000210', usuario: 'MARIANA LOGISTICA', origem: '1', ...h });
const nIt = {};
const cob = (p, c) => { nIt[p.pedido] = (nIt[p.pedido] || 0) + 1; p.custos.push({ item: String(nIt[p.pedido]).padStart(3, '0'), cte: '', data: p.dataEnvio, transportadora: p.transportadora, transportadoraNome: p.transportadoraNome, situacao: '', valorEsperado: 0, obs: '', usuario: 'romulo.garcia', alteradoEm: '2026-11-19 08:47:48', ...c }); };
pedidos.forEach((p, i) => {
  if (!p.dataEnvio || i === 74) return;
  cob(p, { tipo: 'E', cte: String(512000 + i * 37), valor: Math.round(p.frete * (0.7 + rnd() * 0.5) * 100) / 100 });
  if (p.reentrega === 'SIM') cob(p, { tipo: 'R', cte: String(530000 + i * 13), valor: Math.round(p.frete * 0.6 * 100) / 100, data: p.dataNovaEntrega });
});
// o pedido do print: reentrega + armazenagem divergente + taxa ajustada
const P1 = pedidos[65];
P1.reentrega = 'SIM'; { const x = new Date(P1.dataEntrega + 'T12:00:00'); x.setDate(x.getDate() + 3); P1.dataNovaEntrega = x.toISOString().slice(0, 10); } P1.indicador = '2'; P1.custos = []; nIt[P1.pedido] = 0; cob(P1, { tipo: 'E', cte: '514405', valor: 737.17 });
cob(P1, { tipo: 'R', cte: '533410', valor: 286.4, data: P1.dataNovaEntrega });
cob(P1, { tipo: 'A', cte: 'ARM-2231', valor: 240, data: P1.dataNovaEntrega, situacao: 'D', valorEsperado: 80, obs: 'Cobraram 3 dias de armazenagem; o combinado foi 1 dia. Contato com a transportadora em 18/11.', usuario: 'MARIANA LOGISTICA', alteradoEm: '2026-11-19 10:12:05' });
cob(P1, { tipo: 'O', cte: 'TDE-118', valor: 95, data: P1.dataNovaEntrega, situacao: 'A', valorEsperado: 95, obs: 'Taxa de dificuldade de entrega confirmada pela transportadora.', usuario: 'MARIANA LOGISTICA', alteradoEm: '2026-11-19 10:20:41' });
pedidos[40].custos[0].situacao = 'C'; pedidos[40].custos[0].valorEsperado = Math.round(pedidos[40].custos[0].valor * 0.8 * 100) / 100; pedidos[40].custos[0].obs = 'Valor acima da tabela; aguardando retorno do comercial da transportadora.';
H(P1.pedido, { item: '', acao: 'A', campo: 'C5_ZDTENV', titulo: 'Data de envio', de: '', para: P1.dataEnvio.split('-').reverse().join('/'), origem: '2', usuario: 'MARIANA LOGISTICA', hora: '08:30:10', data: '2026-11-13' });
H(P1.pedido, { item: '001', acao: 'I', campo: 'ZLC', titulo: 'Cobranca incluida', de: '', para: `Envio - CTE ${P1.custos[0].cte} - R$ ${P1.custos[0].valor.toFixed(2).replace('.', ',')}`, origem: '3', usuario: 'romulo.garcia', hora: '08:47:48' });
H(P1.pedido, { item: '', acao: 'A', campo: 'C5_ZREENTR', titulo: 'Gerou reentrega', de: 'N - Nao', para: 'S - Sim', hora: '09:58:12' });
H(P1.pedido, { item: '', acao: 'A', campo: 'C5_ZNDENT', titulo: 'Nova data de entrega', de: '', para: P1.dataNovaEntrega.split('-').reverse().join('/'), hora: '09:58:12' });
H(P1.pedido, { item: '002', acao: 'I', campo: 'ZLC', titulo: 'Cobranca incluida', de: '', para: 'Reentrega - CTE 533410 - R$ 286,40', hora: '10:01:30' });
H(P1.pedido, { item: '003', acao: 'I', campo: 'ZLC', titulo: 'Cobranca incluida', de: '', para: 'Armazenagem - CTE ARM-2231 - R$ 240,00 - D - Divergente', hora: '10:12:05' });
H(P1.pedido, { item: '004', acao: 'I', campo: 'ZLC', titulo: 'Cobranca incluida', de: '', para: 'Outra taxa - CTE TDE-118 - R$ 95,00 - C - Em contato', hora: '10:15:02' });
H(P1.pedido, { item: '004', acao: 'A', campo: 'ZLC_SITUA', titulo: 'Situacao', de: 'C - Em contato', para: 'A - Ajustado', hora: '10:20:41' });

// campos de 23/11/2026 (teste): endereco, mensagem da nota, observacao do retorno e pendencias
pedidos.forEach((p, i) => {
  p.enderecoEntrega = 'RUA DAS FLORES, ' + (100 + i); p.complementoEntrega = i % 3 ? '' : 'SALA 2'; p.bairroEntrega = 'CENTRO'; p.cepEntrega = '01310100';
  p.mensagemNota = i % 4 === 0 ? 'PEDIDO DE LOCACAO - NAO INCIDE ICMS. CONTRATO 12 MESES.' : '';
  p.obsRetorno = p.dataRetorno ? 'Cliente recusou: endereco errado no pedido.' : '';
  if (!p.notas.length && i % 3 === 0) { p.transportadora = ''; p.transportadoraNome = ''; }
});
pedidos[65].mensagemNota = 'ENTREGA COM AGENDAMENTO PREVIO. RECEBIMENTO DE SEG A SEX, DAS 8H AS 17H.';
{ const hj = d(0); pedidos[71].dataEnvio = hj; pedidos[72].dataEnvio = hj; }

// envios parciais (25/11/2026, teste): 3 pedidos faturados em 2 NFs
const parcial = (i, nf2, fat2, env2, prev2, ent2) => {
  const p = pedidos[i];
  p.nfPrincipal = p.notas[0];
  p.itens.push({ item: '02', produto: 'IMP80TER', descricao: 'IMPRESSORA TERMICA 80MM', quantidade: 2, entregue: 2, valor: 2300, tes: '501', descTes: 'VENDA DE PRODUCAO', nota: nf2, serie: '1', dataFat: fat2, numerosSerie: [] });
  p.notas.push(nf2);
  p.envios = [{ nf: nf2, serie: '1', dataFat: fat2, transportadoraNf: '000102', gravado: !!env2, dataEnvio: env2, dataPrevisao: prev2, dataEntrega: ent2, tipoMaterial: env2 ? 'P' : '', indicador: '', transportadora: '000102', usuario: '', alteradoEm: '' }];
};
parcial(75, '000009900', d(-2), '', '', '');            // 1a NF em transito, 2a sem envio
parcial(30, '000009901', d(-60), d(-59), d(-55), d(-56)); // as duas entregues
parcial(20, '000009902', d(-3), d(-2), d(1), '');        // 1a entregue, 2a em transito (print)
pedidos[20].envios[0].tipoMaterial = 'P'; pedidos[20].custos.push({ nf: '000009902', item: '002', tipo: 'E', cte: '548812', data: d(-2), transportadora: '000102', transportadoraNome: 'EXPRESSO BETA', valor: 212.4, situacao: '', valorEsperado: 0, obs: '', usuario: 'MARIANA LOGISTICA', alteradoEm: '2026-11-23 09:14:02' });
parcial(40, '000009903', pedidos[40].dataFaturamento, '', '', ''); // NF do mesmo dia: junto com o 1o envio
pedidos.forEach((p, i) => { p.tipoFrete = p.notas.length ? (i % 9 === 4 ? 'F' : 'C') : (i % 2 ? 'C' : ''); });
// finalizado sem entrega: extravio com reembolso pendente
Object.assign(pedidos[77], { finalizado: 'S', motivoFinal: 'E', dataFinal: d(0), pedidoFinal: '', reembolso: 'P', valorReembolso: 0, dataReembolso: '', obsFinal: 'Transportadora confirmou o extravio da carga em 25/11. Reembolso solicitado pelo valor da NF.' });
// frete sem CTE: retirado pelo cliente
pedidos[60].custos = [{ nf: '', item: '001', tipo: 'E', cte: 'SEM CTE', data: pedidos[60].dataEnvio, transportadora: pedidos[60].transportadora, transportadoraNome: pedidos[60].transportadoraNome, valor: 0, situacao: '', valorEsperado: 0, obs: 'Retirado pelo cliente na fábrica, sem frete.', usuario: 'MARIANA LOGISTICA', alteradoEm: '2026-11-24 15:02:11' }];
// indicador Outros com a descricao
pedidos[50].indicador = '7'; pedidos[50].obsIndicador = 'Cliente pediu para segurar a entrega até o fim da reforma da loja.';
pedidos.forEach((p) => { if (!p.envios) { p.envios = []; p.nfPrincipal = p.notas[0] || ''; } });
const SIT = { D: 'Divergente', C: 'Em contato', A: 'Ajustado', I: 'Aceito como veio' };
const TIPO = { E: 'Envio', R: 'Reentrega', A: 'Armazenagem', D: 'Devolução', O: 'Outra taxa' };
http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const json = (o, s = 200) => { r.statusCode = s; r.setHeader('Content-Type', 'application/json'); r.end(JSON.stringify(o)); };
  if (u.pathname.endsWith('/logistica/pedidos')) console.log('GET pedidos ' + new Date().toISOString());
  if (u.pathname.endsWith('/logistica/pedidos'))
    return json({ versao: '2026-11-25b', geradoEm: d(0) + ' 10:30:00', de: '2025-01-01', ate: d(0), camposFaltando: [], temCustos: true, temHistorico: true, temEnvios: true, temNfCusto: true,
      opcoes: { tipoMaterial: [['T', 'Terminal'], ['P', 'Periférico'], ['C', 'Catraca'], ['D', 'Pedestal']], indicador: [['1', 'Atraso transportadora'], ['2', 'Ausência destinatário'], ['3', 'Divergência endereço'], ['4', 'Entrega agendada'], ['6', 'Extravio'], ['7', 'Outros']], reentrega: [['S', 'Sim'], ['N', 'Não']], tipoPedido: [['VEN', 'Venda'], ['LOC', 'Locação']], tipoFrete: [['C', 'CIF'], ['F', 'FOB'], ['T', 'Por conta de terceiros'], ['R', 'Por conta remetente'], ['D', 'Por conta destinatario'], ['S', 'Sem frete']], motivoRetorno: [['1', 'Recusa'], ['2', 'Endereço'], ['3', 'Avaria'], ['4', 'Outros']],
        tipoCusto: Object.entries(TIPO), situacaoCusto: Object.entries(SIT) },
      tamanhos: { C5_ZOBS: 70, ZLH_OBS: 250 }, transportadoras: TR, total: pedidos.length, pedidos });
  if (q.method === 'PUT' && /\/logistica\/pedidos\/\d+$/.test(u.pathname)) {
    let corpo = ''; q.on('data', (c) => (corpo += c)); q.on('end', () => {
      const rec = Number(u.pathname.split('/').pop()); const p = pedidos.find((x) => x.recno === rec); const b = JSON.parse(corpo || '{}');
      console.log('PUT ' + rec + ' ' + corpo); Object.assign(p, b); json(p);
    }); return;
  }
  if (q.method === 'POST' && u.pathname.endsWith('/logistica/envios')) {
    let corpo = ''; q.on('data', (c) => (corpo += c)); q.on('end', () => {
      const b = JSON.parse(corpo || '{}'); console.log('POST envios ' + corpo);
      const p = pedidos.find((x) => x.recno === b.recno); const e = p.envios.find((x) => x.nf === b.nf);
      ['dataEnvio', 'dataPrevisao', 'dataEntrega', 'tipoMaterial', 'indicador', 'transportadora'].forEach((k) => { if (k in b) e[k] = b[k]; });
      e.gravado = true; json(p);
    }); return;
  }
  if (q.method === 'POST' && u.pathname.endsWith('/logistica/custos')) {
    let corpo = ''; q.on('data', (c) => (corpo += c)); q.on('end', () => {
      const b = JSON.parse(corpo || '{}'); console.log('POST custos ' + corpo);
      const p = pedidos.find((x) => x.recno === b.recno); p.custos = p.custos || [];
      if (b.acao === 'incluir') { const it = String(p.custos.length + 1).padStart(3, '0'); p.custos.push({ nf: b.nf || '', item: it, tipo: b.tipo, cte: b.cte || '', data: b.data || '', transportadora: b.transportadora || '', transportadoraNome: '', valor: b.valor || 0, situacao: b.situacao || '', valorEsperado: b.valorEsperado || 0, obs: b.obs || '', usuario: 'TESTE', alteradoEm: '' }); json({ ...p, itemCusto: it }); }
      else json(p);
    }); return;
  }
  if (u.pathname.endsWith('/logistica/historico')) return json({ temHistorico: true, historico: hist[u.searchParams.get('pedido')] || [] });
  json({ error: { message: 'somente leitura' } }, 404);
}).listen(3998, () => console.log('mock2 3998 ' + pedidos.length + ' pedidos; print: ' + P1.pedido + ' recno ' + P1.recno));
