/**
 * Logistica (LOGREL) na planilha Google.
 *
 * Busca a API REST do Protheus (getVsLogPedidos, a mesma da tela LOGRELAPP) e
 * regrava as abas "Pedidos", "Itens", "Custos de frete" e "Resumo". Um gatilho
 * de tempo repete a busca a cada GATILHO_MINUTOS. Mesmo molde da planilha do
 * RX Pedidos (RX-Pedidos/PCPREL/planilha/Codigo.gs).
 *
 * As colunas e as regras (quadro, situacao da entrega, frete cobrado, custo)
 * sao as do "Exportar XLSX" da tela (app/src/app/painel.ts: montar e
 * gerarXlsxArquivo). Mudou la, mudar aqui.
 *
 * Configuracao (Extensoes > Apps Script > Configuracoes do projeto > Propriedades do script):
 *   PROTHEUS_URL     ex.: https://xxxxx.protheus.cloudtotvs.com.br:10407/rest
 *   PROTHEUS_USUARIO usuario do Protheus SOMENTE LEITURA
 *   PROTHEUS_SENHA   senha desse usuario
 *   DIAS             opcional: pedidos COM NF emitidos nos ultimos N dias
 *                    (vazio = 365, igual a tela; maximo 1100). Os sem NF vem todos.
 * As credenciais ficam so nas propriedades, nunca neste codigo.
 */

const ROTA = "/api/v1/vs-financial-data/logistica/pedidos";
const ABA_PED = "Pedidos";
const ABA_ITENS = "Itens";
const ABA_CUS = "Custos de frete";
// Envios parciais (25/11/2026): uma linha por envio (NF)
const ABA_ENV = "Envios";
const ABA_RES = "Resumo";
const ABA_INFO = "Atualizacao";
const GATILHO_MINUTOS = 15; // 1, 5, 10, 15 ou 30
const DIAS_PADRAO = 365;
const DIAS_MAX = 1100;
// Regras da tela
const DIAS_VENCE = 2; // em transito: faltando ate N dias para a previsao = "Vence"
const DIAS_FAT_PARADO = 2; // faturado sem envio ha mais de N dias
const EM_ABERTO = ["D", "C"]; // cobranca de frete divergente / em contato

// Quadros (etapas) na ordem da tela; cor so na celula do Quadro
const QUADROS = {
  prev: { nome: "Previsto", ordem: 0, cor: "#ffe599" },
  fat: { nome: "Faturado", ordem: 1, cor: "#f6b26b" },
  env: { nome: "Enviado", ordem: 2, cor: "#6fa8dc" },
  ent: { nome: "Entregue", ordem: 3, cor: "#274e13" },
  ret: { nome: "Retornou", ordem: 4, cor: "#b7b7b7" },
  // finalizado sem data de entrega: extravio, enviado em outro pedido, outro motivo (24/11/2026)
  fin: { nome: "Finalizado", ordem: 5, cor: "#e6cfb8" },
};
const PRAZOS = {
  noprazo: { nome: "No prazo", cor: "#d9ead3" },
  vence: { nome: "Vence em até 2 dias", cor: "#f4cccc" },
  atrasado: { nome: "Atrasado", cor: "#990000" },
  semprev: { nome: "Sem previsão", cor: null },
  "": { nome: "", cor: null },
};
// Fundos escuros recebem fonte branca
const FUNDOS_ESCUROS = ["#274e13", "#990000"];
const COR_TITULO = "#1f4e78";
const COR_ZEBRA_1 = "#ffffff";
const COR_ZEBRA_2 = "#f3f3f3";

// Usadas so se o SX3 nao mandar o combo (iguais as da tela)
const OPCOES_PADRAO = {
  tipoMaterial: [["T", "Terminal"], ["P", "Periférico"], ["C", "Catraca"], ["D", "Pedestal"]],
  indicador: [
    ["1", "Atraso transportadora"],
    ["2", "Ausência destinatário"],
    ["3", "Divergência endereço"],
    ["4", "Entrega agendada"],
    ["5", "Retido fiscalização"],
    ["6", "Extravio"],
    ["7", "Outros"],
  ],
  motivoRetorno: [["1", "Recusa"], ["2", "Endereço"], ["3", "Avaria"], ["4", "Outros"]],
  motivoFinal: [["E", "Extravio"], ["P", "Enviado em outro pedido"], ["O", "Outro motivo"]],
  reembolso: [["P", "Pendente"], ["S", "Reembolsado"], ["N", "Sem reembolso"]],
  tipoPedido: [
    ["AST", "Assis. técnica"], ["COM", "Comodato"], ["LOC", "Locação"], ["REM", "Remessa"],
    ["TRC", "Troca"], ["VAV", "Venda avulsa"], ["VEN", "Venda"],
  ],
  tipoCusto: [["E", "Envio"], ["R", "Reentrega"], ["A", "Armazenagem"], ["D", "Devolução"], ["O", "Outra taxa"]],
  situacaoCusto: [["D", "Divergente"], ["C", "Em contato"], ["A", "Ajustado"], ["I", "Aceito como veio"]],
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Logística")
    .addItem("Atualizar agora", "atualizar")
    .addItem("Ligar atualização automática", "instalarGatilho")
    .addItem("Desligar atualização automática", "removerGatilho")
    .addToUi();
}

function atualizar() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return; // outra atualizacao em andamento
  const inicio = new Date();
  try {
    const resp = buscarApi_();
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const ctx = { resp: resp, hoje: hoje, temCustos: !!resp.temCustos };
    const regs = resp.pedidos
      .map((p) => montar_(p, ctx))
      .sort((a, b) => QUADROS[a.et].ordem - QUADROS[b.et].ordem || a.p.pedido.localeCompare(b.p.pedido));

    const cont = gravarPedidos_(regs, ctx);
    gravarItens_(regs);
    const nEnv = gravarEnvios_(regs, ctx);
    let nCus = 0;
    if (ctx.temCustos) nCus = gravarCustos_(regs, ctx);
    let obs = "";
    try {
      gravarResumo_(regs, ctx);
    } catch (e) {
      obs = " (resumo: " + (e && e.message ? e.message : e) + ")";
    }
    registrar_(
      inicio,
      "OK",
      regs.length +
        " pedidos " +
        resumoContagem_(cont) +
        (ctx.temCustos ? ", " + nCus + " cobrancas de frete" : " (sem a tabela de custos ZLC)") +
        ", " + nEnv + " envios" +
        " | API " +
        resp.versao +
        " | com NF de " +
        dataBr_(resp.de) +
        " a " +
        dataBr_(resp.ate) +
        ((resp.camposFaltando || []).length ? " | campos faltando na SC5: " + resp.camposFaltando.join(", ") : "") +
        obs,
    );
  } catch (e) {
    // Em erro os dados anteriores ficam nas abas; so registra o motivo
    registrar_(inicio, "ERRO", String(e && e.message ? e.message : e));
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function buscarApi_() {
  const p = PropertiesService.getScriptProperties();
  const base = (p.getProperty("PROTHEUS_URL") || "").replace(/\/+$/, "");
  const usuario = p.getProperty("PROTHEUS_USUARIO");
  const senha = p.getProperty("PROTHEUS_SENHA");
  if (!base || !usuario || !senha) {
    throw new Error("Configure PROTHEUS_URL, PROTHEUS_USUARIO e PROTHEUS_SENHA nas propriedades do script.");
  }
  let dias = parseInt(p.getProperty("DIAS") || "", 10);
  if (!(dias > 0)) dias = DIAS_PADRAO;
  dias = Math.min(dias, DIAS_MAX);
  const hoje = new Date();
  const de = new Date(hoje.getTime() - dias * 86400000);
  const tz = Session.getScriptTimeZone();
  const url =
    base +
    ROTA +
    "?de=" +
    Utilities.formatDate(de, tz, "yyyyMMdd") +
    "&ate=" +
    Utilities.formatDate(hoje, tz, "yyyyMMdd");

  const resp = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { Authorization: "Basic " + Utilities.base64Encode(usuario + ":" + senha) },
    muteHttpExceptions: true,
  });
  const codigo = resp.getResponseCode();
  if (codigo !== 200) {
    const h = resp.getHeaders();
    const detalhe = h["X-Erro"] || h["x-erro"] || resp.getContentText().slice(0, 300);
    const etapa = h["X-Erro-Etapa"] || h["x-erro-etapa"];
    throw new Error("API respondeu " + codigo + (etapa ? " etapa " + etapa : "") + ": " + detalhe);
  }
  const dados = JSON.parse(resp.getContentText("UTF-8"));
  if (!Array.isArray(dados.pedidos)) throw new Error('Resposta da API sem "pedidos".');
  return dados;
}

// ---------------------------------------------------------------- regras
// Igual ao montar() da tela
function montar_(p, ctx) {
  const itens = p.itens || [];
  const temNota = (p.notas || []).length > 0;
  const reent = p.reentrega === "SIM";
  const entFinal = reent ? p.dataNovaEntrega : p.dataEntrega;
  // retorno vem antes de tudo: a mercadoria voltou, mesmo com data de entrega
  // finalizado sem entrega (24/11/2026) encerra o pedido sem a data de entrega
  const et = p.dataRetorno ? "ret" : entFinal ? "ent" : p.finalizado === "S" ? "fin" : p.dataEnvio ? "env" : temNota ? "fat" : "prev";
  let prazo = "";
  let atraso = null;
  const prev = dt_(p.dataPrevisao);
  if (et === "ent" || et === "env") {
    if (!prev) prazo = "semprev";
    else if (et === "ent") {
      atraso = dias_(prev, dt_(entFinal));
      prazo = atraso > 0 ? "atrasado" : "noprazo";
    } else {
      const falta = dias_(ctx.hoje, prev);
      atraso = -falta;
      prazo = falta < 0 ? "atrasado" : falta <= DIAS_VENCE ? "vence" : "noprazo";
    }
  }
  const cus = ctx.temCustos ? p.custos || [] : null;
  const abertos = cus ? cus.filter((c) => EM_ABERTO.indexOf(c.situacao) >= 0) : [];
  // envios parciais (25/11/2026): etapa, prazo e entrega do pedido saem dos envios (NFs)
  const envs = envios_(p, ctx);
  let etM = et;
  let prazoM = prazo;
  let atrasoM = atraso;
  let entFinalM = entFinal || "";
  if (envs.length) {
    const todos = envs.every((e) => e.et === "ent");
    etM = p.dataRetorno ? "ret" : todos ? "ent" : p.finalizado === "S" ? "fin" : envs.some((e) => e.et === "env") ? "env" : "fat";
    entFinalM = todos ? envs.map((e) => e.entFinal).sort().slice(-1)[0] || "" : "";
    const conta = etM === "env" ? envs.filter((e) => e.et === "env") : etM === "ent" ? envs : [];
    const pior = conta.slice().sort((a, b) => RANK_PRAZO[b.prazo] - RANK_PRAZO[a.prazo] || (b.atraso === null ? -999 : b.atraso) - (a.atraso === null ? -999 : a.atraso))[0];
    prazoM = pior ? pior.prazo : "";
    atrasoM = pior ? pior.atraso : null;
  }
  return {
    p: p,
    et: etM,
    entFinal: entFinalM,
    prazo: prazoM,
    atraso: atrasoM,
    envs: envs,
    cobrado: (p.frete || 0) + (p.freteNaoDestacado || 0),
    custo: cus
      ? cus.reduce((s, c) => s + (c.valor || 0), 0)
      : (p.valorCte || 0) + (p.valorCteReentrega || 0),
    nDiv: abertos.length,
    difDiv: abertos
      .filter((c) => c.valorEsperado > 0)
      .reduce((s, c) => s + (c.valor - c.valorEsperado), 0),
    ctes: cus ? cus.map((c) => c.cte).filter(Boolean) : [p.cte, p.cteReentrega].filter(Boolean),
    pend: pendencias_(p, etM, prazoM, ctx, envs),
    qtd: itens.reduce((s, i) => s + (i.quantidade || 0), 0),
    valor: itens.reduce((s, i) => s + (i.valor || 0), 0),
  };
}

// O que falta preencher no pedido: igual ao pendencias() da tela (23/11/2026).
// Campo que nao existe no ambiente (camposFaltando) nao conta.
const PEND_TXT = {
  transp: "transportadora", volume: "volume", especie: "espécie", peso: "peso",
  envio: "data de envio", previsao: "previsão de entrega", entrega: "data de entrega",
  novaData: "nova data de entrega", cte: "CTE ou custo de frete", tpmat: "tipo de material",
  indicador: "indicador de atraso", motivo: "motivo do retorno", reenvio: "pedido do reenvio",
  descInd: "descrição do indicador", reembolso: "reembolso do extravio",
};
// Indicador "Outros" (opcao cujo texto comeca com "Outro") e extravio sem reembolso resolvido
function indOutros_(ctx, cod) {
  if (!cod) return false;
  const t = txtOp_(ctx, "indicador", cod).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  return t.indexOf("OUTR") === 0;
}
function reembolsoPendente_(p) {
  return p.finalizado === "S" && p.motivoFinal === "E" && p.reembolso !== "S" && p.reembolso !== "N";
}
// Gravidade do prazo: o pior envio da a situacao do pedido faturado em partes
const RANK_PRAZO = { atrasado: 3, vence: 2, semprev: 1, noprazo: 0, "": -1 };

// Envios do pedido faturado em partes (uma NF por envio), igual ao envios() da
// tela: o 1o (NF mais antiga) usa os campos da SC5; os outros vem da ZLE. [] = uma NF so
function envios_(p, ctx) {
  const outros = p.envios || [];
  if (!outros.length) return [];
  const itens = p.itens || [];
  const nfP = p.nfPrincipal || "";
  const fatDe = (nf) => itens.filter((i) => i.nota === nf && i.dataFat).map((i) => i.dataFat).sort()[0] || "";
  const qtdDe = (nf) => itens.filter((i) => i.nota === nf).reduce((s, i) => s + (i.quantidade || 0), 0);
  const cus = p.custos || [];
  const lista = [
    envio_(0, nfP, fatDe(nfP), p.dataEnvio, p.dataPrevisao, p.reentrega === "SIM" ? p.dataNovaEntrega : p.dataEntrega, p.tipoMaterial, p.indicador, p.transportadora, cus.filter((c) => !c.nf || c.nf === nfP), qtdDe(nfP), ctx),
  ];
  outros.forEach((e, k) =>
    lista.push(envio_(k + 1, e.nf, e.dataFat, e.dataEnvio, e.dataPrevisao, e.dataEntrega, e.tipoMaterial, e.indicador, e.transportadora, cus.filter((c) => c.nf === e.nf), qtdDe(e.nf), ctx)),
  );
  return lista;
}

function envio_(idx, nf, dataFat, dataEnvio, dataPrevisao, entFinal, tipoMaterial, indicador, transportadora, custos, qtd, ctx) {
  const et = entFinal ? "ent" : dataEnvio ? "env" : "fat";
  let prazo = "";
  let atraso = null;
  const prev = dt_(dataPrevisao);
  if (et !== "fat") {
    if (!prev) prazo = "semprev";
    else if (et === "ent") {
      atraso = dias_(prev, dt_(entFinal));
      prazo = atraso > 0 ? "atrasado" : "noprazo";
    } else {
      const falta = dias_(ctx.hoje, prev);
      atraso = -falta;
      prazo = falta < 0 ? "atrasado" : falta <= DIAS_VENCE ? "vence" : "noprazo";
    }
  }
  return {
    idx: idx, nf: nf, dataFat: dataFat || "", dataEnvio: dataEnvio || "", dataPrevisao: dataPrevisao || "",
    entFinal: entFinal || "", tipoMaterial: tipoMaterial || "", indicador: indicador || "",
    transportadora: transportadora || "", custos: custos, qtd: qtd, et: et, prazo: prazo, atraso: atraso,
  };
}

function pendencias_(p, et, prazo, ctx, envs) {
  const falta = ctx.resp.camposFaltando || [];
  const tem = (c) => falta.indexOf(c) < 0;
  const out = [];
  if (et === "prev") {
    if (!p.transportadora) out.push("transp");
    if (tem("C5_VOLUME1") && !p.volume) out.push("volume");
    if (tem("C5_ESPECI1") && !p.especie) out.push("especie");
    if ((tem("C5_PESOL") && !p.pesoLiquido) || (tem("C5_PBRUTO") && !p.pesoBruto)) out.push("peso");
  }
  if (et === "fat" && tem("C5_ZDTENV") && p.dataFaturamento && dias_(dt_(p.dataFaturamento), ctx.hoje) > DIAS_FAT_PARADO) out.push("envio");
  if (et === "env" || et === "ent") {
    if (prazo === "semprev" && tem("C5_ZDTPREV")) out.push("previsao");
    if (et === "env" && prazo === "atrasado" && tem("C5_ZDTENTR")) out.push("entrega");
    if (et === "env" && p.reentrega === "SIM" && !p.dataNovaEntrega) out.push("novaData");
    // qualquer cobranca lancada (de qualquer tipo, com CTE, texto ou "Sem CTE") resolve (24/11/2026)
    if (ctx.temCustos ? !(p.custos || []).length : tem("C5_ZCTE") && !p.cte) out.push("cte");
    if (tem("C5_ZTPMAT") && !p.tipoMaterial) out.push("tpmat");
    if (prazo === "atrasado" && tem("C5_ZINDICA") && !p.indicador) out.push("indicador");
    if (tem("ZLH_OBS") && indOutros_(ctx, p.indicador) && !(p.obsIndicador || "").trim()) out.push("descInd");
  }
  if (et === "ret") {
    if (tem("C5_ZMOTRET") && !p.motivoRetorno) out.push("motivo");
    if (tem("C5_ZPEDREN") && !p.pedidoReenvio) out.push("reenvio");
  }
  if (et === "fin" && reembolsoPendente_(p)) out.push("reembolso");
  if (!envs || !envs.length) return out;
  // envios parciais (25/11/2026): o que depende do envio e conferido em cada NF
  const porEnvio = [];
  envs.forEach((e) => {
    if (e.et === "fat") {
      if (e.dataFat && dias_(dt_(e.dataFat), ctx.hoje) > DIAS_FAT_PARADO) porEnvio.push("envio");
      return;
    }
    if (!e.dataPrevisao) porEnvio.push("previsao");
    if (e.et === "env" && e.prazo === "atrasado") porEnvio.push("entrega");
    if (ctx.temCustos && !e.custos.length) porEnvio.push("cte");
    if (!e.tipoMaterial) porEnvio.push("tpmat");
    if (e.prazo === "atrasado" && !e.indicador) porEnvio.push("indicador");
  });
  const doEnvio = ["envio", "previsao", "entrega", "cte", "tpmat", "indicador"];
  const juntos = out.filter((k) => doEnvio.indexOf(k) < 0).concat(porEnvio);
  return juntos.filter((k, i) => juntos.indexOf(k) === i);
}

// Algum envio do pedido saiu no dia (o 1o ou um parcial)
function saiuNoDia_(r, diaIso) {
  return r.p.dataEnvio === diaIso || (r.envs || []).some((e) => e.dataEnvio === diaIso);
}

// Aba Envios: uma linha por envio (NF). Pedido de uma NF = 1 linha (dados do
// pedido); faturado em partes = 1 linha por NF, com os dados de cada envio
function gravarEnvios_(regs, ctx) {
  const col = [
    ["Pedido", "txt"], ["Envio", "gen"], ["NF", "txt"], ["Faturamento", "data"], ["Cliente", "gen"], ["Transportadora", "gen"],
    ["Data de envio", "data"], ["Previsão de entrega", "data"], ["Entrega", "data"], ["Situação da entrega", "gen"], ["Dias de atraso", "int"],
    ["Tipo de material", "gen"], ["Indicador de atraso", "gen"], ["CTEs", "txt"], ["Custo de frete", "moeda"], ["Quantidade (un)", "int"],
  ];
  const transps = ctx.resp.transportadoras || [];
  const nomeT = (k) => { const t2 = transps.filter((x) => x[0] === k)[0]; return t2 ? t2[1] : k; };
  const cteTxt = (lista) => lista.map((c) => c.cte).filter(Boolean).join(" / ");
  const linhas = [];
  regs.forEach((r) => {
    if (!(r.p.notas || []).length) return;
    const cliente = r.p.fantasia || r.p.nome;
    if (!r.envs.length) {
      const v = [
        r.p.pedido, "1º de 1", (r.p.notas || []).join(", "), r.p.dataFaturamento, cliente, r.p.transportadoraNome || r.p.transportadora,
        r.p.dataEnvio, r.p.dataPrevisao, r.entFinal, PRAZOS[r.prazo].nome, r.prazo === "atrasado" && r.atraso !== null ? r.atraso : "",
        txtOp_(ctx, "tipoMaterial", r.p.tipoMaterial), txtOp_(ctx, "indicador", r.p.indicador), r.ctes.join(" / "), r.custo ? r2_(r.custo) : "", r.qtd,
      ];
      linhas.push(v.map((x, k) => valorCelula_(col[k][1], x)));
      return;
    }
    r.envs.forEach((e) => {
      const custo = e.custos.reduce((s, c) => s + (c.valor || 0), 0);
      const v = [
        r.p.pedido, (e.idx + 1) + "º de " + r.envs.length, e.nf, e.dataFat, cliente, nomeT(e.transportadora),
        e.dataEnvio, e.dataPrevisao, e.entFinal, PRAZOS[e.prazo].nome, e.prazo === "atrasado" && e.atraso !== null ? e.atraso : "",
        txtOp_(ctx, "tipoMaterial", e.tipoMaterial), txtOp_(ctx, "indicador", e.indicador), cteTxt(e.custos), custo ? r2_(custo) : "", e.qtd,
      ];
      linhas.push(v.map((x, k) => valorCelula_(col[k][1], x)));
    });
  });
  gravarTabela_(ABA_ENV, 2, col, linhas, []);
  return linhas.length;
}

function txtOp_(ctx, k, cod) {
  if (!cod) return k === "situacaoCusto" ? "OK" : "";
  const lista = (ctx.resp.opcoes && ctx.resp.opcoes[k] && ctx.resp.opcoes[k].length
    ? ctx.resp.opcoes[k]
    : OPCOES_PADRAO[k]) || [];
  const o = lista.filter((x) => x[0] === cod)[0];
  return o ? o[1] : cod;
}

function simNao_(v) {
  return v === "SIM" ? "Sim" : v === "NAO" ? "Não" : v || "";
}

const r2_ = (x) => Math.round((x || 0) * 100) / 100;

// ---------------------------------------------------------------- abas
// Colunas: [titulo, tipo, valor]. Tipo: txt (texto, mantem zero a esquerda),
// data, moeda, int, peso, gen (sem formato)
function colunasPedidos_(ctx) {
  const cus = ctx.temCustos;
  const lista = [
    ["Pedido", "txt", (r) => r.p.pedido],
    ["Quadro", "gen", (r) => QUADROS[r.et].nome],
    ["Situação da entrega", "gen", (r) => PRAZOS[r.prazo].nome],
    ["Dias de atraso", "int", (r) => (r.prazo === "atrasado" && r.atraso !== null ? r.atraso : "")],
    ["Emissão", "data", (r) => r.p.emissao],
    ["Tipo de pedido", "gen", (r) => txtOp_(ctx, "tipoPedido", r.p.tipoPedido)],
    ["Cliente", "txt", (r) => r.p.cliente],
    ["Loja", "txt", (r) => r.p.loja],
    ["Nome", "gen", (r) => r.p.nome],
    ["Nome fantasia", "gen", (r) => r.p.fantasia],
    ["Grupo do cliente", "gen", (r) => r.p.grupo],
    ["Cidade de entrega", "gen", (r) => r.p.cidade],
    ["UF", "gen", (r) => r.p.uf],
    ["Telefone (entrega)", "txt", (r) => r.p.telefone || ""],
    ["Telefone (cliente do pedido)", "txt", (r) => r.p.telefoneCliente || ""],
    ["Endereço de entrega", "gen", (r) => [r.p.enderecoEntrega, r.p.complementoEntrega].filter(Boolean).join(" - ")],
    ["Bairro", "gen", (r) => r.p.bairroEntrega || ""],
    ["CEP", "txt", (r) => r.p.cepEntrega || ""],
    ["Vendedor", "gen", (r) => r.p.vendedor],
    ["Cód. transportadora", "txt", (r) => r.p.transportadora],
    ["Transportadora", "gen", (r) => r.p.transportadoraNome],
    ["Notas fiscais", "txt", (r) => (r.p.notas || []).join(", ")],
    ["Faturamento", "data", (r) => r.p.dataFaturamento],
    ["Saída programada", "data", (r) => r.p.previsaoSaida],
    ["Envio", "data", (r) => r.p.dataEnvio],
    ["Previsão de entrega", "data", (r) => r.p.dataPrevisao],
    ["Data de entrega", "data", (r) => r.p.dataEntrega],
    ["Gerou reentrega", "gen", (r) => simNao_(r.p.reentrega)],
    ["Nova data de entrega", "data", (r) => r.p.dataNovaEntrega],
    ["Entrega final", "data", (r) => r.entFinal],
    ["Indicador de atraso", "gen", (r) => txtOp_(ctx, "indicador", r.p.indicador)],
    ["Tipo de material", "gen", (r) => txtOp_(ctx, "tipoMaterial", r.p.tipoMaterial)],
    ["Data do retorno", "data", (r) => r.p.dataRetorno || ""],
    ["Motivo do retorno", "gen", (r) => txtOp_(ctx, "motivoRetorno", r.p.motivoRetorno || "")],
    ["Pedido do reenvio", "txt", (r) => r.p.pedidoReenvio || ""],
    ["Observação do retorno", "gen", (r) => r.p.obsRetorno || ""],
    ["Finalizado sem entrega", "gen", (r) => (r.p.finalizado === "S" ? txtOp_(ctx, "motivoFinal", r.p.motivoFinal || "") || "Sim" : "")],
    ["Data da finalização", "data", (r) => (r.p.finalizado === "S" ? r.p.dataFinal || "" : "")],
    ["Enviado no pedido", "txt", (r) => (r.p.finalizado === "S" ? r.p.pedidoFinal || "" : "")],
    ["Reembolso do extravio", "gen", (r) => (r.p.finalizado === "S" && r.p.motivoFinal === "E" ? txtOp_(ctx, "reembolso", r.p.reembolso || "") || "Pendente" : "")],
    ["Valor do reembolso", "moeda", (r) => (r.p.finalizado === "S" && r.p.valorReembolso ? r.p.valorReembolso : "")],
    ["Data do reembolso", "data", (r) => (r.p.finalizado === "S" ? r.p.dataReembolso || "" : "")],
    ["Observação da finalização", "gen", (r) => (r.p.finalizado === "S" ? r.p.obsFinal || "" : "")],
    ["Indicador: o que aconteceu", "gen", (r) => r.p.obsIndicador || ""],
    ["Volume", "int", (r) => r.p.volume || ""],
    ["Espécie", "gen", (r) => r.p.especie || ""],
    ["Peso líquido", "peso", (r) => r.p.pesoLiquido || ""],
    ["Peso bruto", "peso", (r) => r.p.pesoBruto || ""],
    ["Quantidade (un)", "int", (r) => r.qtd],
    ["Valor dos itens", "moeda", (r) => r2_(r.valor)],
    ["Frete destacado", "moeda", (r) => r.p.frete || 0],
    ["Frete não destacado", "moeda", (r) => r.p.freteNaoDestacado || 0],
    ["Frete cobrado", "moeda", (r) => r2_(r.cobrado)],
  ]
    .concat(
      cus
        ? [
            ["CTEs", "txt", (r) => r.ctes.join(" / ")],
            ["Cobranças de frete", "int", (r) => (r.p.custos || []).length],
            ["Custo de frete", "moeda", (r) => r2_(r.custo)],
            ["Cobranças em divergência", "int", (r) => r.nDiv || ""],
            ["Acima do esperado", "moeda", (r) => (r.difDiv ? r2_(r.difDiv) : "")],
          ]
        : [
            ["CTE", "txt", (r) => r.p.cte],
            ["Valor do CTE", "moeda", (r) => r.p.valorCte || 0],
            ["CTE da reentrega", "txt", (r) => r.p.cteReentrega],
            ["Valor do CTE da reentrega", "moeda", (r) => r.p.valorCteReentrega || 0],
            ["Custo de frete", "moeda", (r) => r2_(r.custo)],
          ],
    )
    .concat([
      ["Cobrado − custo", "moeda", (r) => (r.custo ? r2_(r.cobrado - r.custo) : "")],
      ["Observações da entrega", "gen", (r) => r.p.obsEntrega || ""],
      ["Mensagem para a nota", "gen", (r) => r.p.mensagemNota || ""],
      ["Informação faltando", "gen", (r) => r.pend.map((k) => PEND_TXT[k]).join(", ")],
    ]);
  return primeiro_(lista, PRIMEIRAS_PEDIDOS);
}

// Aba Pedidos: estas colunas vem primeiro, nesta ordem (pedido do usuario em
// 22/11/2026: as datas logo depois do Pedido); as demais seguem a ordem acima
const PRIMEIRAS_PEDIDOS = ["Pedido", "Saída programada", "Envio", "Previsão de entrega", "Data de entrega"];
// Celulas pintadas na aba Pedidos (achadas pelo titulo)
const COL_QUADRO = "Quadro";
const COL_PRAZO = "Situação da entrega";

function primeiro_(col, titulos) {
  const frente = titulos.map((t) => col.filter((c) => c[0] === t)[0]).filter(Boolean);
  return frente.concat(col.filter((c) => titulos.indexOf(c[0]) < 0));
}

function gravarPedidos_(regs, ctx) {
  const col = colunasPedidos_(ctx);
  const linhas = regs.map((r) => col.map((c) => valorCelula_(c[1], c[2](r))));
  const titulos = col.map((c) => c[0]);
  const iQuadro = titulos.indexOf(COL_QUADRO) + 1;
  const iPrazo = titulos.indexOf(COL_PRAZO) + 1;
  const aba = gravarTabela_(ABA_PED, 0, col, linhas, [iQuadro, iPrazo]);
  // Cor so nas celulas Quadro e Situacao da entrega
  const cont = {};
  if (regs.length) {
    const pinta = (iCol, cor) => {
      if (iCol < 1) return;
      const cores = regs.map((r) => [cor(r)]);
      aba
        .getRange(2, iCol, regs.length, 1)
        .setBackgrounds(cores)
        .setFontColors(cores.map((c) => [corFonte_(c[0])]))
        .setFontWeight("bold");
    };
    pinta(iQuadro, (r) => QUADROS[r.et].cor);
    pinta(iPrazo, (r) => PRAZOS[r.prazo].cor);
    regs.forEach((r) => {
      const k = r.prazo ? QUADROS[r.et].nome + "/" + PRAZOS[r.prazo].nome : QUADROS[r.et].nome;
      cont[k] = (cont[k] || 0) + 1;
    });
  }
  aba.setFrozenColumns(1);
  return cont;
}

function gravarItens_(regs) {
  const col = [
    ["Pedido", "txt"], ["Item", "txt"], ["Quadro", "gen"], ["Cliente", "gen"], ["Transportadora", "gen"],
    ["Produto", "txt"], ["Descrição", "gen"], ["Quantidade", "int"], ["Entregue", "int"], ["Valor", "moeda"],
    ["TES", "txt"], ["Descrição da TES", "gen"], ["NF", "txt"], ["Série da NF", "txt"], ["Data da NF", "data"],
    ["Números de série", "txt"], ["Envio", "data"], ["Entrega final", "data"],
  ];
  const linhas = [];
  regs.forEach((r) =>
    (r.p.itens || []).forEach((i) => {
      const v = [
        r.p.pedido, i.item, QUADROS[r.et].nome, r.p.fantasia || r.p.nome,
        r.p.transportadoraNome || r.p.transportadora, i.produto, i.descricao, i.quantidade, i.entregue,
        i.valor, i.tes, i.descTes, i.nota, i.nota ? i.serie : "", i.dataFat,
        (i.numerosSerie || []).map((s) => s[0]).join(", "), r.p.dataEnvio, r.entFinal,
      ];
      linhas.push(v.map((x, k) => valorCelula_(col[k][1], x)));
    }),
  );
  gravarTabela_(ABA_ITENS, 1, col, linhas, []);
}

function gravarCustos_(regs, ctx) {
  const col = [
    ["Pedido", "txt"], ["Item", "txt"], ["Tipo", "gen"], ["CTE / documento", "txt"], ["Data", "data"],
    ["Transportadora", "gen"], ["Valor cobrado", "moeda"], ["Situação", "gen"], ["Valor esperado", "moeda"],
    ["Diferença", "moeda"], ["Observação", "gen"], ["Alterado por", "gen"], ["Alterado em", "txt"],
    ["Cliente", "gen"], ["Quadro", "gen"], ["Envio", "data"],
  ];
  const linhas = [];
  regs.forEach((r) =>
    (r.p.custos || []).forEach((c) => {
      const dif =
        EM_ABERTO.indexOf(c.situacao) >= 0 && c.valorEsperado > 0 ? r2_(c.valor - c.valorEsperado) : "";
      const v = [
        r.p.pedido, c.item, txtOp_(ctx, "tipoCusto", c.tipo), c.cte, c.data,
        c.transportadoraNome || c.transportadora, c.valor, txtOp_(ctx, "situacaoCusto", c.situacao),
        c.valorEsperado || "", dif, c.obs, c.usuario, c.alteradoEm, r.p.fantasia || r.p.nome,
        QUADROS[r.et].nome, r.p.dataEnvio,
      ];
      linhas.push(v.map((x, k) => valorCelula_(col[k][1], x)));
    }),
  );
  gravarTabela_(ABA_CUS, 2, col, linhas, []);
  return linhas.length;
}

// Regrava uma aba inteira: cabecalho, formatos por coluna, filtro e listras.
// semZebra = colunas (1 = A) pintadas pelo script: as listras pulam essas
// colunas (uma faixa por trecho continuo, faixas nao podem se sobrepor)
function gravarTabela_(nomeAba, posicao, col, linhas, semZebra) {
  const ss = SpreadsheetApp.getActive();
  const aba = ss.getSheetByName(nomeAba) || ss.insertSheet(nomeAba, posicao);
  const nCol = col.length;
  if (aba.getFilter()) aba.getFilter().remove();
  aba.getBandings().forEach((b) => b.remove());
  aba.clear();
  garantirTamanho_(aba, linhas.length + 1, nCol);

  aba
    .getRange(1, 1, 1, nCol)
    .setValues([col.map((c) => c[0])])
    .setFontWeight("bold")
    .setBackground(COR_TITULO)
    .setFontColor("#ffffff");
  if (linhas.length > 0) {
    col.forEach((c, i) => {
      const f = FORMATOS[c[1]];
      if (f) aba.getRange(2, i + 1, linhas.length, 1).setNumberFormat(f);
    });
    aba.getRange(2, 1, linhas.length, nCol).setValues(linhas);
  }
  // Remove sobra de linhas de uma carga anterior maior
  const sobra = aba.getMaxRows() - (linhas.length + 1);
  if (sobra > 50) aba.deleteRows(linhas.length + 2, sobra - 50);

  aba.setFrozenRows(1);
  aba.getRange(1, 1, Math.max(linhas.length, 1) + 1, nCol).createFilter();
  if (linhas.length > 0) {
    const pula = semZebra || [];
    let ini = 0;
    for (let c = 1; c <= nCol + 1; c++) {
      const livre = c <= nCol && pula.indexOf(c) < 0;
      if (livre && !ini) ini = c;
      if (!livre && ini) {
        aba
          .getRange(2, ini, linhas.length, c - ini)
          .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false)
          .setFirstRowColor(COR_ZEBRA_1)
          .setSecondRowColor(COR_ZEBRA_2);
        ini = 0;
      }
    }
  }
  return aba;
}

const FORMATOS = {
  txt: "@",
  data: "dd/mm/yyyy",
  moeda: "R$ #,##0.00",
  int: "#,##0",
  peso: "#,##0.000",
};

function valorCelula_(tipo, v) {
  if (v === null || v === undefined) return "";
  if (tipo === "data") return dt_(v) || "";
  if (tipo === "txt") return String(v);
  return v;
}

function corFonte_(fundo) {
  return FUNDOS_ESCUROS.indexOf(fundo) >= 0 ? "#ffffff" : null;
}

// ---------------------------------------------------------------- resumo
// Tabelas calculadas aqui (sem tabela dinamica), recriadas a cada carga
function gravarResumo_(regs, ctx) {
  const ss = SpreadsheetApp.getActive();
  const aba = ss.getSheetByName(ABA_RES) || ss.insertSheet(ABA_RES, 0);
  aba.clear();
  const tz = Session.getScriptTimeZone();
  const hojeIso = Utilities.formatDate(ctx.hoje, tz, "yyyy-MM-dd");
  const conta = (f) => regs.filter(f).length;

  aba.getRange(1, 1).setValue("Resumo da logística").setFontSize(14).setFontWeight("bold");
  aba
    .getRange(2, 1)
    .setValue(
      "Gerado em " +
        Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm") +
        " | " +
        regs.length +
        " pedidos (sem NF: todos; com NF: emitidos de " +
        dataBr_(ctx.resp.de) +
        " a " +
        dataBr_(ctx.resp.ate) +
        ")",
    )
    .setFontColor("#666666");

  // Pontos de atencao (iguais aos cartoes da tela)
  const kpis = [
    ["Em trânsito atrasados", conta((r) => r.et === "env" && r.prazo === "atrasado")],
    ["Em trânsito que vencem em até " + DIAS_VENCE + " dias", conta((r) => r.et === "env" && r.prazo === "vence")],
    ["Entregas previstas para hoje (em trânsito)", conta((r) => r.et === "env" && r.p.dataPrevisao === hojeIso)],
    ["Enviados sem previsão de entrega", conta((r) => r.et === "env" && r.prazo === "semprev")],
    [
      "Faturados sem envio há mais de " + DIAS_FAT_PARADO + " dias",
      conta((r) => r.et === "fat" && r.p.dataFaturamento && dias_(dt_(r.p.dataFaturamento), ctx.hoje) > DIAS_FAT_PARADO),
    ],
    ["Retornados aguardando reenvio", conta((r) => r.et === "ret" && !r.p.pedidoReenvio)],
    ["Extravios com reembolso pendente", conta((r) => r.et === "fin" && reembolsoPendente_(r.p))],
    ["Pedidos com informação faltando (coluna Informação faltando)", conta((r) => r.pend.length > 0)],
    ["Saíram hoje", conta((r) => saiuNoDia_(r, hojeIso))],
  ];
  if (ctx.temCustos) kpis.push(["Pedidos com cobrança de frete em divergência", conta((r) => r.nDiv > 0)]);
  let linha = 4;
  linha = bloco_(aba, linha, 1, "Pontos de atenção", ["Situação", "Pedidos"], kpis, ["gen", "int"]);

  // Pedidos por quadro
  const porQuadro = Object.keys(QUADROS).map((k) => {
    const rs = regs.filter((r) => r.et === k);
    return [
      QUADROS[k].nome,
      rs.length,
      rs.reduce((s, r) => s + r.qtd, 0),
      r2_(rs.reduce((s, r) => s + r.valor, 0)),
    ];
  });
  const fimQuadro = bloco_(
    aba, 4, 4, "Pedidos por quadro",
    ["Quadro", "Pedidos", "Quantidade (un)", "Valor dos itens"], porQuadro,
    ["gen", "int", "int", "moeda"],
  );
  linha = Math.max(linha, fimQuadro) + 1;

  // Por transportadora (enviados e entregues)
  const tr = {};
  regs
    .filter((r) => r.et === "env" || r.et === "ent")
    .forEach((r) => {
      const nome = r.p.transportadoraNome || r.p.transportadora || "(sem transportadora)";
      const t = tr[nome] || (tr[nome] = { env: 0, envAtr: 0, ent: 0, entOk: 0, entAtr: 0, cobrado: 0, custo: 0 });
      if (r.et === "env") {
        t.env++;
        if (r.prazo === "atrasado") t.envAtr++;
      } else {
        t.ent++;
        if (r.prazo === "noprazo") t.entOk++;
        if (r.prazo === "atrasado") t.entAtr++;
      }
      t.cobrado += r.cobrado;
      t.custo += r.custo;
    });
  const linhasTr = Object.keys(tr)
    .map((n) => {
      const t = tr[n];
      const comPrev = t.entOk + t.entAtr;
      return [
        n, t.env, t.envAtr, t.ent, t.entOk, t.entAtr,
        comPrev ? t.entOk / comPrev : "", r2_(t.cobrado), r2_(t.custo), r2_(t.cobrado - t.custo),
      ];
    })
    .sort((a, b) => b[1] + b[3] - (a[1] + a[3]));
  linha = bloco_(
    aba, linha, 1, "Por transportadora (enviados e entregues)",
    ["Transportadora", "Em trânsito", "Em trânsito atrasados", "Entregues", "Entregues no prazo",
      "Entregues com atraso", "% no prazo (entregues com previsão)", "Frete cobrado", "Custo de frete",
      "Cobrado − custo"],
    linhasTr,
    ["gen", "int", "int", "int", "int", "int", "pct", "moeda", "moeda", "moeda"],
  ) + 1;

  // Pontualidade pelo mes da entrega (ultimos 12 meses com entrega)
  const meses = {};
  regs
    .filter((r) => r.et === "ent" && r.entFinal)
    .forEach((r) => {
      const m = r.entFinal.slice(0, 7);
      const x = meses[m] || (meses[m] = { ent: 0, ok: 0, atr: 0, sem: 0 });
      x.ent++;
      if (r.prazo === "noprazo") x.ok++;
      else if (r.prazo === "atrasado") x.atr++;
      else x.sem++;
    });
  const linhasMes = Object.keys(meses)
    .sort()
    .reverse()
    .slice(0, 12)
    .map((m) => {
      const x = meses[m];
      return [m.slice(5, 7) + "/" + m.slice(0, 4), x.ent, x.ok, x.atr, x.sem, x.ok + x.atr ? x.ok / (x.ok + x.atr) : ""];
    });
  bloco_(
    aba, linha, 1, "Entregues por mês da entrega",
    ["Mês", "Entregues", "No prazo", "Com atraso", "Sem previsão", "% no prazo"],
    linhasMes,
    ["txt", "int", "int", "int", "int", "pct"],
  );
  aba.autoResizeColumns(1, 10);
}

// Escreve titulo + tabela a partir de (linha, coluna); devolve a proxima linha livre
function bloco_(aba, linha, coluna, titulo, cab, linhas, tipos) {
  garantirTamanho_(aba, linha + linhas.length + 2, coluna + cab.length);
  aba.getRange(linha, coluna).setValue(titulo).setFontWeight("bold").setFontColor(COR_TITULO);
  aba
    .getRange(linha + 1, coluna, 1, cab.length)
    .setValues([cab])
    .setFontWeight("bold")
    .setBackground(COR_TITULO)
    .setFontColor("#ffffff");
  if (!linhas.length) {
    aba.getRange(linha + 2, coluna).setValue("Sem dados").setFontColor("#999999");
    return linha + 4;
  }
  tipos.forEach((t, i) => {
    const f = t === "pct" ? "0%" : FORMATOS[t];
    if (f) aba.getRange(linha + 2, coluna + i, linhas.length, 1).setNumberFormat(f);
  });
  aba.getRange(linha + 2, coluna, linhas.length, cab.length).setValues(linhas);
  return linha + linhas.length + 3;
}

function resumoContagem_(c) {
  const k = Object.keys(c);
  return k.length ? "[" + k.map((x) => x + " " + c[x]).join(", ") + "]" : "";
}

// ---------------------------------------------------------------- utilitarios
function dt_(s) {
  if (s instanceof Date) return s;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

function dias_(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function dataBr_(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
  return m ? m[3] + "/" + m[2] + "/" + m[1] : String(s || "");
}

function garantirTamanho_(aba, nLinhas, nColunas) {
  if (aba.getMaxRows() < nLinhas) aba.insertRowsAfter(aba.getMaxRows(), nLinhas - aba.getMaxRows());
  if (aba.getMaxColumns() < nColunas) {
    aba.insertColumnsAfter(aba.getMaxColumns(), nColunas - aba.getMaxColumns());
  }
}

function registrar_(inicio, status, detalhe) {
  const ss = SpreadsheetApp.getActive();
  const aba = ss.getSheetByName(ABA_INFO) || ss.insertSheet(ABA_INFO);
  if (aba.getLastRow() === 0) {
    aba.appendRow(["Quando", "Status", "Detalhe", "Segundos"]);
    aba.getRange(1, 1, 1, 4).setFontWeight("bold");
  }
  aba.insertRowAfter(1);
  aba
    .getRange(2, 1, 1, 4)
    .setValues([[inicio, status, detalhe, Math.round((new Date() - inicio) / 1000)]]);
  aba.getRange(2, 1).setNumberFormat("dd/mm/yyyy hh:mm:ss");
  // Guarda so as ultimas 200 execucoes
  if (aba.getLastRow() > 201) aba.deleteRows(202, aba.getLastRow() - 201);
}

function instalarGatilho() {
  removerGatilho();
  ScriptApp.newTrigger("atualizar").timeBased().everyMinutes(GATILHO_MINUTOS).create();
  atualizar();
}

function removerGatilho() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === "atualizar")
    .forEach((t) => ScriptApp.deleteTrigger(t));
}
