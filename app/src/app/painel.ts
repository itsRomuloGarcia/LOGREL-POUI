import * as G from './graficos';
import { autoMapa, baixar, celulaCsv, dataIso, Destino, DESTINOS, DESTINOS_IMP, lerArquivo, lerTabela, numBR, numPedido, opcaoDe, semValor, simNao } from './importar';
import { AbaXlsx, baixar as baixarXlsx, gerarXlsx } from './xlsx';
import { Custo, CustoEdicao, EnvioEdicao, HistLinha, ItemPedido, LogResposta, Opcao, Pedido, PedidoEdicao } from './log.service';

// Tela Logistica (pedidos de entrega): Quadros (previstos, faturados, enviados,
// entregues), Lista completa (um item por linha, com exportacao) e Indicadores.
// A edicao de todos os campos de logistica do pedido e feita na gaveta do pedido.
// Desenhada direto no DOM (todo texto passa por esc()), no mesmo padrao e
// visual da tela RX Pedidos (PCPREL).

/** So o DANFE: a carta de correcao saiu da tela em 16/11/2026 (pedido do usuario) */
export type AcaoNf = 'danfe';

export interface Api {
  /** silencioso = atualizacao automatica: sem "Atualizando…" e, se falhar, mantem os dados */
  carregar(de: string, ate: string, silencioso?: boolean): void;
  /** origem 'importacao' marca o historico como importacao */
  salvar(recno: number, d: PedidoEdicao, origem?: string): Promise<Pedido>;
  /** Cobranca de frete (ZLC): incluir, alterar, excluir. API >= 2026-11-19a */
  salvarCusto(d: CustoEdicao): Promise<Pedido>;
  /** Envio de uma NF do pedido depois da 1a (ZLE). API >= 2026-11-25a */
  salvarEnvio(d: EnvioEdicao): Promise<Pedido>;
  /** Historico da logistica do pedido (ZLH) */
  historico(pedido: string): Promise<HistLinha[]>;
  /** Pedidos pelo numero, sem filtro (importacao de pedido que nao veio na consulta) */
  buscarPedidos(pedidos: string[]): Promise<Pedido[]>;
  mensagemErro(e: unknown): string;
  diagnostico(): Promise<string>;
  fechar: (() => void) | null;
  /** DANFE pela SPEDNFE (so dentro do Protheus; false = sem canal) */
  nota: ((acao: AcaoNf, d: { nota: string; serie: string; pedido: string }) => boolean) | null;
}

// ---------- regras ----------
type Etapa = 'prev' | 'fat' | 'env' | 'ent' | 'ret' | 'fin';
type Prazo = 'noprazo' | 'vence' | 'atrasado' | 'semprev' | '';

const ETAPAS: { id: Etapa; nome: string; curto: string; desc: string; cor: string }[] = [
  { id: 'prev', nome: 'Pedidos previstos', curto: 'Previsto', desc: 'Todos os pedidos sem nota fiscal', cor: G.CAT[3] },
  { id: 'fat', nome: 'Pedidos faturados', curto: 'Faturado', desc: 'Com NF, aguardando a saída', cor: G.CAT[0] },
  { id: 'env', nome: 'Pedidos enviados', curto: 'Enviado', desc: 'Saíram da empresa, sem entrega', cor: G.CAT[1] },
  { id: 'ent', nome: 'Pedidos entregues', curto: 'Entregue', desc: 'Entrega confirmada', cor: G.CAT[2] },
  // mercadoria voltou para a empresa; o reenvio sai em outro pedido (13/11/2026)
  { id: 'ret', nome: 'Pedidos retornados', curto: 'Retornou', desc: 'Voltaram para a empresa', cor: G.COR_OUTROS },
  // finalizado sem data de entrega: extravio, enviado em outro pedido, outro motivo
  // (24/11/2026). Nos Quadros fica na mesma coluna dos retornados.
  { id: 'fin', nome: 'Finalizados sem entrega', curto: 'Finalizado', desc: 'Extravio, enviado em outro pedido ou outro motivo', cor: '#c9a27e' },
];
/** Colunas dos Quadros: os finalizados entram na coluna dos retornados */
const COLUNAS_QUADRO = ETAPAS.filter((e) => e.id !== 'fin');
const COL_RET = { nome: 'Retornados e finalizados', desc: 'Voltaram para a empresa ou foram finalizados sem entrega' };
/** C5_TIPO diferente de N (os Previstos trazem todos os pedidos sem NF) */
const TIPO_NF: Record<string, string> = { D: 'Devolução', B: 'Beneficiamento', C: 'Compl. preço', I: 'Compl. ICMS', P: 'Compl. IPI' };
const ET = Object.fromEntries(ETAPAS.map((e) => [e.id, e])) as Record<Etapa, (typeof ETAPAS)[number]>;

const PRAZO_TXT: Record<Prazo, string> = { noprazo: 'No prazo', vence: 'Vence em até 2 dias', atrasado: 'Atrasado', semprev: 'Sem previsão', '': '' };
const COR_OK = '#2f7d32';
const COR_ATR = '#b42318';
const COR_NEUTRA = G.COR_OUTROS;
/** Quadro "Enviados hoje" (mesmo azul do dia de hoje na Programacao) */
const COR_HOJE = '#0b6e99';
/** Envio: avisar quando faltam ate N dias para a previsao da transportadora */
const DIAS_VENCE = 2;
/** Entregues no quadro: so os ultimos N dias (o resto atras de "mostrar todos") */
const DIAS_ENTREGUES = 30;
const LIMITE_CARTOES = 60;

// Opcoes usadas so se o SX3 nao tiver combo (o GET manda as do dicionario)
// C5_ZTPMAT conforme o SX3 ajustado pelo usuario em 13/11/2026 (Pedestal = D)
const TPMAT_PADRAO: Opcao[] = [['T', 'Terminal'], ['P', 'Periférico'], ['C', 'Catraca'], ['D', 'Pedestal']];
const INDICA_PADRAO: Opcao[] = [
  ['1', 'Atraso transportadora'],
  ['2', 'Ausência destinatário'],
  ['3', 'Divergência endereço'],
  ['4', 'Entrega agendada'],
  ['5', 'Retido fiscalização'],
  ['6', 'Extravio'],
  ['7', 'Outros'],
];
/** C5_ZMOTRET informado pelo usuario em 13/11/2026 */
const MOTRET_PADRAO: Opcao[] = [['1', 'Recusa'], ['2', 'Endereço'], ['3', 'Avaria'], ['4', 'Outros']];
/** Finalizacao sem entrega (ZLH, fixas na API 2026-11-24b) */
const MOTFIN_PADRAO: Opcao[] = [['E', 'Extravio'], ['P', 'Enviado em outro pedido'], ['O', 'Outro motivo']];
const REEMB_PADRAO: Opcao[] = [['P', 'Pendente'], ['S', 'Reembolsado'], ['N', 'Sem reembolso']];
/** Indicador de atraso "Outros": opcao do C5_ZINDICA cujo texto comeca com "Outro" */
const ehOutros = (txt: string) => /^OUTR/.test(normal(txt || ''));
/** Custos de frete (ZLC_TIPO / ZLC_SITUA), usados so se o SX3 nao mandar o combo */
const TIPOCUSTO_PADRAO: Opcao[] = [['E', 'Envio'], ['R', 'Reentrega'], ['A', 'Armazenagem'], ['D', 'Devolução'], ['O', 'Outra taxa']];
const SITCUSTO_PADRAO: Opcao[] = [['D', 'Divergente'], ['C', 'Em contato'], ['A', 'Ajustado'], ['I', 'Aceito como veio']];
/** Situacao da cobranca que ainda pede contato com a transportadora */
const EM_ABERTO = ['D', 'C'];
/** Cobranca sem CTE (24/11/2026): marca gravada no ZLC_CTE. Com valor = frete
 *  pago sem CTE; valor zero = movimentacao interna, sem cobranca. Conta como
 *  envio lancado (some a pendencia "CTE do envio"). */
const SEM_CTE = 'SEM CTE';
const COR_SITCUSTO: Record<string, string> = { '': 'noprazo', D: 'atrasado', C: 'reent', A: 'mat', I: 'semprev' };
/** Campos da ZLC no historico */
const ROTULO_CUSTO: Record<string, string> = {
  ZLC_TIPO: 'Tipo',
  ZLC_CTE: 'CTE / documento',
  ZLC_DATA: 'Data',
  ZLC_TRANSP: 'Transportadora',
  ZLC_VALOR: 'Valor cobrado',
  ZLC_SITUA: 'Situação',
  ZLC_VLRESP: 'Valor esperado',
  ZLC_OBS: 'Observação',
};
/** C5_TPFRETE informado pelo usuario em 25/11/2026 (usado so se o SX3 nao mandar o combo) */
const TPFRETE_PADRAO: Opcao[] = [['C', 'CIF'], ['F', 'FOB'], ['T', 'Por conta de terceiros'], ['R', 'Por conta remetente'], ['D', 'Por conta destinatário'], ['S', 'Sem frete']];
const TIPOPED_PADRAO: Opcao[] = [['AST', 'Assis. técnica'], ['COM', 'Comodato'], ['LOC', 'Locação'], ['REM', 'Remessa'], ['TRC', 'Troca'], ['VAV', 'Venda avulsa'], ['VEN', 'Venda']];

/** Chave do corpo do PUT -> campo da SC5 (para desligar o que ainda nao existe) */
const CAMPO: Record<keyof PedidoEdicao, string> = {
  previsaoSaida: 'C5_FECENT',
  dataEnvio: 'C5_ZDTENV',
  dataPrevisao: 'C5_ZDTPREV',
  dataEntrega: 'C5_ZDTENTR',
  tipoMaterial: 'C5_ZTPMAT',
  cte: 'C5_ZCTE',
  valorCte: 'C5_ZVLRCTE',
  reentrega: 'C5_ZREENTR',
  cteReentrega: 'C5_ZCTEREE',
  valorCteReentrega: 'C5_ZVCTERE',
  dataNovaEntrega: 'C5_ZNDENT',
  indicador: 'C5_ZINDICA',
  dataRetorno: 'C5_ZDTRET',
  motivoRetorno: 'C5_ZMOTRET',
  pedidoReenvio: 'C5_ZPEDREN',
  transportadora: 'C5_TRANSP',
  frete: 'C5_FRETE',
  volume: 'C5_VOLUME1',
  freteNaoDestacado: 'C5_ZFRETE',
  especie: 'C5_ESPECI1',
  pesoLiquido: 'C5_PESOL',
  pesoBruto: 'C5_PBRUTO',
  tipoFrete: 'C5_TPFRETE',
  obsEntrega: 'C5_ZOBS',
  /** observacao do retorno: linha da ZLH (ZLH_OBS), nao campo da SC5 (23/11/2026) */
  obsRetorno: 'ZLH_OBS',
  /** finalizacao sem entrega e descricao do indicador "Outros": linhas da ZLH (24/11/2026) */
  finalizado: 'ZLH_OBS',
  motivoFinal: 'ZLH_OBS',
  dataFinal: 'ZLH_OBS',
  pedidoFinal: 'ZLH_OBS',
  reembolso: 'ZLH_OBS',
  valorReembolso: 'ZLH_OBS',
  dataReembolso: 'ZLH_OBS',
  obsFinal: 'ZLH_OBS',
  obsIndicador: 'ZLH_OBS',
};
const NUMEROS: (keyof PedidoEdicao)[] = ['valorCte', 'valorCteReentrega', 'frete', 'volume', 'freteNaoDestacado', 'pesoLiquido', 'pesoBruto', 'valorReembolso'];
/** Dados da finalizacao sem entrega: so com "finalizado" marcado (apagar desmarca tudo) */
const FINAL: (keyof PedidoEdicao)[] = ['motivoFinal', 'dataFinal', 'pedidoFinal', 'reembolso', 'valorReembolso', 'dataReembolso', 'obsFinal'];
/** So no extravio */
const REEMBOLSO: (keyof PedidoEdicao)[] = ['reembolso', 'valorReembolso', 'dataReembolso'];
const REENTREGA: (keyof PedidoEdicao)[] = ['cteReentrega', 'valorCteReentrega', 'dataNovaEntrega'];
/** Dados do pedido que vao para a NF-e: so editam antes da nota (frete destacado e
 *  nao destacado sao so consulta desde 15/11/2026, pedido do usuario) */
const COMERCIAIS: (keyof PedidoEdicao)[] = ['transportadora', 'tipoFrete', 'volume', 'especie', 'pesoLiquido', 'pesoBruto'];
/** Tem que estar preenchidos antes da emissao da NF-e (pedido do usuario, 15/11/2026) */
const PARA_NFE: (keyof PedidoEdicao)[] = ['especie', 'pesoLiquido', 'pesoBruto'];
/** Peso com ate 4 casas (C5_PESOL/C5_PBRUTO), sem zeros a mais */
const pesoTxt = (n: number | undefined) => (n ? n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 }) : '');
/** So valem com a data do retorno */
const RETORNO: (keyof PedidoEdicao)[] = ['motivoRetorno', 'pedidoReenvio', 'obsRetorno'];
/** Textos livres: campo caracter vira uma linha so; memo mantem as quebras */
const OBS: (keyof PedidoEdicao)[] = ['obsEntrega', 'obsRetorno', 'obsFinal', 'obsIndicador'];

/** Informacao que falta no pedido (pedido do usuario em 23/11/2026): filtro de
 *  cada quadro, selo "Falta" no cartao e card no topo. [texto do filtro, selo] */
type Pend = 'transp' | 'volume' | 'especie' | 'peso' | 'envio' | 'previsao' | 'entrega' | 'novaData' | 'cte' | 'tpmat' | 'indicador' | 'descInd' | 'motivo' | 'reenvio' | 'reembolso';
const PEND_TXT: Record<Pend, [string, string]> = {
  transp: ['Sem transportadora', 'transportadora'],
  volume: ['Sem volume', 'volume'],
  especie: ['Sem espécie', 'espécie'],
  peso: ['Sem peso líquido ou bruto', 'peso'],
  envio: ['Com NF há mais de 2 dias, sem data de envio', 'data de envio'],
  previsao: ['Sem previsão de entrega', 'previsão de entrega'],
  entrega: ['Previsão vencida, sem data de entrega', 'data de entrega'],
  novaData: ['Reentrega sem a nova data de entrega', 'nova data de entrega'],
  cte: ['Sem CTE / custo de frete lançado', 'CTE ou custo de frete'],
  tpmat: ['Sem tipo de material', 'tipo de material'],
  indicador: ['Atrasado sem indicador de atraso', 'indicador de atraso'],
  descInd: ['Indicador "Outros" sem descrição', 'descrição do indicador'],
  motivo: ['Sem motivo do retorno', 'motivo do retorno'],
  reenvio: ['Sem pedido do reenvio', 'pedido do reenvio'],
  reembolso: ['Extravio com reembolso pendente', 'reembolso do extravio'],
};
const PEND_ORDEM = Object.keys(PEND_TXT) as Pend[];
/** Gravidade do prazo (o pior envio da a situacao do pedido faturado em partes) */
const RANK_PRAZO: Record<Prazo, number> = { atrasado: 3, vence: 2, semprev: 1, noprazo: 0, '': -1 };

/** Um envio do pedido faturado em partes (uma NF por envio). idx 0 = 1o envio (SC5) */
interface Env {
  idx: number;
  nf: string;
  serie: string;
  dataFat: string;
  dataEnvio: string;
  dataPrevisao: string;
  /** entrega (no 1o envio, a nova data quando houve reentrega) */
  entFinal: string;
  tipoMaterial: string;
  indicador: string;
  transportadora: string;
  custos: Custo[];
  qtd: number;
  /** NF emitida no mesmo dia da 1a e sem envio proprio na ZLE: saiu junto com o
   *  1o envio (decisao do usuario, 25/11/2026) e herda os dados dele */
  junto: boolean;
  et: 'fat' | 'env' | 'ent';
  prazo: Prazo;
  atraso: number | null;
}
/** Faturado sem envio: pendente depois de N dias com NF (igual ao card "Faturados parados") */
const DIAS_FAT_PARADO = 2;
const ROTULO: Record<string, string> = {
  ...Object.fromEntries(DESTINOS.filter(([d]) => d && d !== 'pedido')),
  finalizado: 'Finalizado sem entrega',
  motivoFinal: 'Motivo da finalização',
  dataFinal: 'Data da finalização',
  pedidoFinal: 'Enviado no pedido',
  reembolso: 'Reembolso do extravio',
  valorReembolso: 'Valor do reembolso',
  dataReembolso: 'Data do reembolso',
  obsFinal: 'Observação da finalização',
  obsIndicador: 'O que aconteceu (indicador Outros)',
};
type TipoOp = 'tipoMaterial' | 'indicador' | 'tipoPedido' | 'tipoFrete' | 'motivoRetorno' | 'motivoFinal' | 'reembolso';
/** Data que encerra o pedido na coluna Retornados e finalizados */
const dataFim = (r: Reg) => (r.et === 'fin' ? r.p.dataFinal || '' : r.p.dataRetorno || '');

/** Ordem de cada quadro: [id, texto, data usada, crescente] */
const ORD_QUADRO: Record<Etapa, [string, string, (r: Reg) => string, boolean][]> = {
  prev: [
    ['emi-asc', 'Emissão: mais antigos primeiro', (r) => r.p.emissao, true],
    ['emi-desc', 'Emissão: mais novos primeiro', (r) => r.p.emissao, false],
    ['sai-asc', 'Saída programada: mais próxima primeiro', (r) => r.p.previsaoSaida || '9999', true],
  ],
  fat: [
    ['fat-asc', 'NF: mais antigas primeiro', (r) => r.p.dataFaturamento, true],
    ['fat-desc', 'NF: mais novas primeiro', (r) => r.p.dataFaturamento, false],
    ['emi-asc', 'Emissão: mais antigos primeiro', (r) => r.p.emissao, true],
    ['emi-desc', 'Emissão: mais novos primeiro', (r) => r.p.emissao, false],
  ],
  env: [
    ['prev-asc', 'Previsão de entrega: mais próxima primeiro', (r) => r.p.dataPrevisao || '9999', true],
    ['env-asc', 'Envio: mais antigos primeiro', (r) => r.p.dataEnvio, true],
    ['env-desc', 'Envio: mais novos primeiro', (r) => r.p.dataEnvio, false],
  ],
  ent: [
    ['ent-desc', 'Entrega: mais recentes primeiro', (r) => r.entFinal, false],
    ['ent-asc', 'Entrega: mais antigas primeiro', (r) => r.entFinal, true],
  ],
  // coluna Retornados e finalizados: data do retorno ou da finalizacao
  ret: [
    ['aguarda', 'Pendentes primeiro', (r) => (r.pend.length ? '0' : '1') + dataFim(r), true],
    ['ret-desc', 'Mais recentes primeiro', dataFim, false],
    ['ret-asc', 'Mais antigos primeiro', dataFim, true],
  ],
  fin: [['fin-desc', 'Mais recentes primeiro', dataFim, false]],
};

/** Pedidos enviados agregados por transportadora (ranking e comparacao) */
interface LnTransp { div: number; nome: string; env: number; ent: number; noPrazo: number; atr: number; comPrev: number; atrDias: number; lead: number; nLead: number; custo: number; nCte: number; cobrado: number; reent: number; qtd: number }
const umaCasa = (v: number) => (Math.round(v * 10) / 10).toLocaleString('pt-BR');
const pctV = (v: number) => `${Math.round(v * 100)}%`;
const rsV = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
/** Comparacao entre transportadoras: [id, botao, valor (null = sem dado), formato, texto menor, cor, escala fixa] */
const COMPARA: [string, string, (g: LnTransp) => number | null, (v: number) => string, (g: LnTransp) => string, string, number | undefined][] = [
  ['pp', '% no prazo', (g) => (g.comPrev ? g.noPrazo / g.comPrev : null), pctV, (g) => `${g.noPrazo} de ${g.comPrev}`, COR_OK, 1],
  ['atrm', 'Atraso médio', (g) => (g.atr ? g.atrDias / g.atr : null), (v) => `${umaCasa(v)} d`, (g) => `${g.atr} atrasado${g.atr > 1 ? 's' : ''}`, COR_ATR, undefined],
  ['lead', 'Tempo de entrega', (g) => (g.nLead ? g.lead / g.nLead : null), (v) => `${umaCasa(v)} d`, (g) => `${g.nLead} entrega${g.nLead > 1 ? 's' : ''}`, G.CAT[0], undefined],
  ['cmed', 'Custo médio do CTE', (g) => (g.nCte ? g.custo / g.nCte : null), rsV, (g) => `${g.nCte} com CTE`, G.CAT[1], undefined],
  ['reent', '% reentrega', (g) => (g.env ? g.reent / g.env : null), pctV, (g) => `${g.reent} de ${g.env}`, G.CAT[3], undefined],
  ['div', '% custo em divergência', (g) => (g.env ? g.div / g.env : null), pctV, (g) => `${g.div} de ${g.env}`, COR_ATR, undefined],
  ['env', 'Envios', (g) => g.env, (v) => v.toLocaleString('pt-BR'), (g) => `${g.qtd.toLocaleString('pt-BR')} un`, G.CAT[0], undefined],
];

/** Uma linha da planilha importada, ja conferida contra o pedido */
interface ImpLinha {
  /** linha na planilha (1 = titulos) */
  n: number;
  pedido: string;
  recno: number;
  dados: PedidoEdicao;
  mudancas: string[];
  erros: string[];
  avisos: string[];
  st: 'ok' | 'erro' | 'igual';
  res?: 'ok' | 'falha';
  msg?: string;
}
interface Imp {
  etapa: 'colar' | 'mapa' | 'previa' | 'gravando' | 'fim';
  texto: string;
  cab: string[];
  linhas: string[][];
  mapa: Destino[];
  /** celula vazia nao altera o campo (desmarcado: vazio limpa) */
  vazioMantem: boolean;
  previa: ImpLinha[];
  feitos: number;
  ver: 'todos' | 'ok' | 'erro';
  /** Pedidos da planilha que nao vieram na consulta, buscados pelo numero (sem filtro) */
  extras: Map<string, Pedido>;
  buscando: boolean;
}

interface Reg {
  p: Pedido;
  et: Etapa;
  /** Entrega que vale: a nova data quando houve reentrega, senao a data de entrega */
  entFinal: string;
  prazo: Prazo;
  /** Entregue: dias entre a previsao e a entrega (+ = atraso). Enviado: dias de atraso ate hoje */
  atraso: number | null;
  cobrado: number;
  /** Com a ZLC: soma das cobrancas (CTE, reentregas e taxas); sem ela: CTE + CTE da reentrega da SC5 */
  custo: number;
  /** Cobrancas divergentes ou em contato (ZLC) */
  nDiv: number;
  /** Soma de (valor - esperado) das cobrancas em aberto que tem o esperado */
  difDiv: number;
  /** Numeros dos CTEs (ZLC ou SC5) */
  ctes: string[];
  /** Informacao que falta preencher (PEND_TXT) */
  pend: Pend[];
  /** Envios parciais (25/11/2026): 1o envio (SC5) + um por NF seguinte; [] = pedido de uma NF so */
  envs: Env[];
  qtd: number;
  valor: number;
  parcial: boolean;
  produtos: string;
  busca: string;
}

// ---------- utilitarios ----------
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const dt = (s: string): Date | null => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) : null);
const dias = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmt = (s: string) => (s && s.length >= 10 ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
const fmtCurto = (s: string) => (s && s.length >= 10 ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '');
const n0 = (x: number) => Number(x || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const rs = (x: number) => Number(x || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const rs0 = (x: number) => Number(x || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '–');
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotMes = (m: string) => `${MESES[+m.slice(5, 7) - 1]}/${m.slice(2, 4)}`;
const numTxt = (n: number) => (n ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
/** Intervalos da atualizacao automatica (minutos; 0 = desligada), igual ao RX Pedidos (24/11/2026) */
const AUTO_OPCOES: [number, string][] = [[0, 'Desligada'], [5, '5 min'], [10, '10 min'], [15, '15 min']];

function ler<T>(k: string, padrao: T): T {
  try {
    const v = localStorage.getItem('logrel-' + k);
    return v === null ? padrao : (JSON.parse(v) as T);
  } catch {
    return padrao;
  }
}
function guardar(k: string, v: unknown): void {
  try {
    localStorage.setItem('logrel-' + k, JSON.stringify(v));
  } catch {
    /* sem armazenamento: so nao lembra */
  }
}

/** Filtros de multipla escolha do topo (lista vazia = todos) */
type FiltroMulti = 'transp' | 'uf' | 'tpmat' | 'tipo' | 'situacao';
const MULTI: [FiltroMulti, string, string][] = [
  ['transp', 'Transportadora', 'Todas'],
  ['uf', 'UF', 'Todas'],
  ['tpmat', 'Tipo de material', 'Todos'],
  ['tipo', 'Tipo de pedido', 'Todos'],
  ['situacao', 'Situação da entrega', 'Todas'],
];
const SITUACOES: [string, string][] = [
  ['atrasado', 'Atrasados'],
  ['noprazo', 'No prazo'],
  ['vence', 'Vencem em até 2 dias'],
  ['semprev', 'Sem previsão'],
];
/** Filtro extra da situacao, so com a tabela de custos */
const SIT_CUSTO: [string, string] = ['custodiv', 'Custo de frete em divergência'];
/** Filtro de data da tela (sobre o que ja foi consultado) */
type CampoData = 'emissao' | 'entrega' | 'previsao';

interface Estado {
  busca: string;
  transp: string[];
  uf: string[];
  tpmat: string[];
  tipo: string[];
  situacao: string[];
  fData: CampoData;
  fDe: string;
  fAte: string;
  de: Date;
  ate: Date;
  ord: { k: string; asc: boolean };
  limite: number;
  /** quadros: cartoes visiveis por etapa e "mostrar todos" dos entregues */
  limQuadro: Record<Etapa, number>;
  entTodos: boolean;
  /** quadros: ordem escolhida em cada coluna (ORD_QUADRO) */
  ordQuadro: Record<Etapa, string>;
  /** quadros: filtro de cada coluna ('' todos, 'pend' qualquer pendencia, ou uma Pend) */
  fQuadro: Record<Etapa, string>;
  /** quadros: card do topo clicado ('' nenhum, 'pend' com pendencia, 'hoje' sairam hoje) */
  fGlobal: string;
  /** indicadores: medida da tabela por transportadora x mes */
  medida: 'custo' | 'cobrado' | 'pedidos';
  ordRank: { k: string; asc: boolean };
  /** indicadores: medida do grafico de comparacao entre transportadoras (COMPARA) */
  compara: string;
}

const ABAS: [string, string][] = [
  ['quadros', 'Quadros'],
  ['programacao', 'Programação'],
  ['entregas', 'Entregas'],
  ['lista', 'Lista completa'],
  ['indicadores', 'Indicadores'],
];

export class Painel {
  private regs: Reg[] = [];
  private resp: LogResposta | null = null;
  private faltando = new Set<string>();
  private carregando = true;
  private erroCarga = '';
  private readonly hoje: Date;
  private tela = ler('tela', 'quadros');
  private salvando = false;
  /** Atualizacao automatica: minutos (0 = desligada), proxima busca, motivo da espera e resposta guardada */
  private readonly auto = { min: 5, proxima: 0, emCurso: false, espera: '', timer: 0, pendente: null as LogResposta | null };
  /** Programacao: pedidos gravando (botao desligado) e o que esta sendo arrastado */
  private readonly ocupados = new Set<number>();
  private arrastando = 0;
  /** o cartao arrastado e da aba Entregas (muda a previsao de entrega, nao a saida) */
  private arrastoEnt = false;
  private limSemProg = LIMITE_CARTOES;
  /** importacao por planilha (janela aberta) */
  private imp: Imp | null = null;
  /** gaveta aberta: recno do pedido */
  private aberto = 0;
  /** gaveta: cobranca em edicao ('' = nova, null = nenhuma), bloco de custos aberto e gravando */
  private custoEdit: string | null = null;
  private custosAbertos = false;
  private salvandoCusto = false;
  /** cobranca nova aberta por "+ Cobranca deste envio": NF ja escolhida */
  private custoNf = '';
  /** envio (indice em r.envs) sendo gravado */
  private salvandoEnvio = -1;
  /** NFs "junto com o 1o envio" que o usuario abriu para registrar um envio separado */
  private readonly separar = new Set<string>();
  /** janela do Exportar XLSX (aberta) */
  private xl: { recorte: string; filtros: boolean; abas: Set<string> } | null = null;
  /** historico do pedido aberto (lido ao abrir o bloco) */
  private hist: { pedido: string; linhas: HistLinha[] | null; erro: string } | null = null;
  private tAviso = 0;
  private tBusca = 0;
  /** Programacao: texto do filtro da coluna "Nao sairam" */
  private fNaoSairam = '';
  private tFiltroNao = 0;
  private readonly e: Estado;
  private readonly el: { conteudo: HTMLElement; abas: HTMLElement; sub: HTMLElement; camada: HTMLElement; faltam: HTMLElement };
  /** opcoes atuais de cada filtro de multipla escolha [valor, texto] */
  private opsMulti: Record<FiltroMulti, [string, string][]> = { transp: [], uf: [], tpmat: [], tipo: [], situacao: SITUACOES };

  constructor(
    private readonly raiz: HTMLElement,
    private readonly api: Api,
    de: string,
    ate: string,
  ) {
    this.hoje = new Date();
    this.hoje.setHours(0, 0, 0, 0);
    this.e = {
      busca: '',
      transp: [],
      uf: [],
      tpmat: [],
      tipo: [],
      situacao: [],
      fData: 'emissao',
      fDe: '',
      fAte: '',
      de: dt(de) || new Date(this.hoje.getFullYear() - 1, 0, 1),
      ate: dt(ate) || this.hoje,
      ord: { k: '', asc: false },
      limite: 200,
      limQuadro: { prev: LIMITE_CARTOES, fat: LIMITE_CARTOES, env: LIMITE_CARTOES, ent: LIMITE_CARTOES, ret: LIMITE_CARTOES, fin: LIMITE_CARTOES },
      entTodos: false,
      // a preferencia guardada antes da coluna Retornados nao tem "ret"
      ordQuadro: { prev: 'emi-asc', fat: 'fat-asc', env: 'prev-asc', ent: 'ent-desc', ret: 'aguarda', fin: 'fin-desc', ...ler('ord-quadro', {}) },
      fQuadro: { prev: '', fat: '', env: '', ent: '', ret: '', fin: '' },
      fGlobal: '',
      medida: ler('medida', 'custo'),
      ordRank: { k: 'env', asc: false },
      compara: ler('compara', 'pp'),
    };
    const multi = ([k, rot, todos]: [FiltroMulti, string, string]) =>
      `<div class="campo"><label id="lbl-${k}">${rot}</label><div class="multi" data-multi="${k}"><button type="button" class="multi-btn" aria-haspopup="true" aria-expanded="false" aria-labelledby="lbl-${k} txt-${k}"><span class="multi-txt" id="txt-${k}">${todos}</span></button><div class="multi-painel" hidden></div></div></div>`;
    raiz.classList.add('rx');
    raiz.innerHTML = `
      <div class="topo">
        <div class="wrap">
          <div class="marca"><img class="logo" src="assets/vs_logo.png" alt="Videosoft"><div class="titulo"><h1>Logística · Pedidos de entrega</h1><span id="lg-sub"></span></div></div>
          <div class="acoes">
            <div class="auto" role="group" aria-label="Atualização automática">
              <span class="auto-rot">Atualização automática</span>
              <div class="seg" id="lg-auto">${AUTO_OPCOES.map(([m, t]) => `<button type="button" data-auto="${m}" aria-pressed="false">${t}</button>`).join('')}</div>
              <span class="auto-st" id="lg-auto-st" aria-live="polite"></span>
            </div>
            <button class="btn pri" data-acao="consultar">Atualizar dados</button>
            <button class="btn" data-acao="xlsx">Exportar XLSX</button>
            <button class="btn" data-acao="importar">Importar planilha</button>
            <button class="btn" data-acao="diag">Diagnóstico</button>
            ${api.fechar ? '<button class="btn" data-acao="sair">Fechar</button>' : ''}
          </div>
        </div>
        <div class="wrap controles">
          <div class="campo"><label for="lg-busca">Buscar</label><input id="lg-busca" type="search" placeholder="Pedido, cliente, cidade, NF, CTE, produto..."></div>
          ${MULTI.map(multi).join('')}
          <div class="campo"><label for="lg-fdata">Filtrar por data</label><div class="periodo">
            <select id="lg-fdata" aria-label="Data usada no filtro"><option value="emissao">Emissão do pedido</option><option value="entrega">Data de entrega</option><option value="previsao">Previsão de entrega</option></select>
            <input id="lg-fde" type="date" aria-label="De"><span class="muted">a</span><input id="lg-fate" type="date" aria-label="Até"></div></div>
          <div class="campo campo-limpar"><button type="button" class="btn" data-acao="limpar-filtros">Limpar filtros</button></div>
        </div>
        <div class="wrap" id="lg-faltam" hidden></div>
        <nav class="wrap abas" id="lg-abas"></nav>
      </div>
      <main class="wrap" id="lg-conteudo"></main>
      <div id="lg-camada"></div>`;
    const q = <T extends HTMLElement>(id: string) => raiz.querySelector('#' + id) as T;
    this.el = {
      conteudo: q('lg-conteudo'),
      abas: q('lg-abas'),
      sub: q('lg-sub'),
      camada: q('lg-camada'),
      faltam: q('lg-faltam'),
    };
    MULTI.forEach(([k]) => this.desenharMulti(k));
    this.ligarEventos();
    this.desenhar();
    const min = ler<number>('auto-min', 5);
    this.auto.min = AUTO_OPCOES.some(([m]) => m === min) ? min : 5;
    this.auto.proxima = Date.now() + this.auto.min * 60000;
    this.marcarAuto();
    // Confere a cada 15 s; ao voltar para a tela, confere na hora
    this.auto.timer = window.setInterval(() => this.verificarAuto(), 15000);
    document.addEventListener('visibilitychange', this.aoVoltar);
  }

  /** Chamado pela casca ao fechar a tela */
  parar(): void {
    clearInterval(this.auto.timer);
    document.removeEventListener('visibilitychange', this.aoVoltar);
  }

  // ---------- atualizacao automatica (mesma regra do RX Pedidos) ----------
  private readonly aoVoltar = () => {
    if (!document.hidden) this.verificarAuto();
  };

  private marcarAuto(): void {
    this.raiz.querySelectorAll<HTMLElement>('#lg-auto [data-auto]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset['auto']) === this.auto.min)));
    this.textoAuto();
  }

  private textoAuto(): void {
    const st = this.raiz.querySelector('#lg-auto-st') as HTMLElement | null;
    if (!st) return;
    const hm = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (!this.auto.min) st.textContent = 'desligada';
    else if (this.auto.emCurso || this.carregando) st.textContent = 'atualizando…';
    else if (this.auto.espera && Date.now() >= this.auto.proxima) st.textContent = `aguardando: ${this.auto.espera}`;
    else st.textContent = `próxima às ${hm(this.auto.proxima)}`;
  }

  /** Por que nao da para atualizar agora sem atrapalhar quem esta usando ('' = pode) */
  private motivoEspera(): string {
    if (document.hidden) return 'tela em segundo plano';
    if (this.carregando || this.salvando || this.salvandoCusto || this.ocupados.size) return 'gravação em andamento';
    if (this.el.camada.querySelector('.gaveta')) return 'pedido aberto';
    if (this.el.camada.querySelector('.modal') || this.imp || this.xl) return 'janela aberta';
    if (this.arrastando) return 'arrastando pedido';
    if ([...this.raiz.querySelectorAll<HTMLElement>('.multi-painel')].some((m) => !m.hidden)) return 'filtro aberto';
    const f = document.activeElement as HTMLElement | null;
    if (f && this.el.conteudo.contains(f) && /^(INPUT|SELECT|TEXTAREA)$/.test(f.tagName)) return 'campo em edição';
    return '';
  }

  private verificarAuto(): void {
    // Resposta automatica que chegou com a gaveta/janela aberta: aplica quando liberar
    if (this.auto.pendente) {
      this.auto.espera = this.motivoEspera();
      if (!this.auto.espera) {
        const r = this.auto.pendente;
        this.auto.pendente = null;
        this.definirDados(r);
      }
      this.textoAuto();
      return;
    }
    if (!this.auto.min || this.auto.emCurso || Date.now() < this.auto.proxima) {
      this.textoAuto();
      return;
    }
    this.auto.espera = this.motivoEspera();
    if (!this.auto.espera) {
      this.auto.emCurso = true;
      const ate = new Date();
      ate.setHours(0, 0, 0, 0);
      this.e.ate = ate;
      this.api.carregar(iso(this.e.de), iso(ate), true);
    }
    this.textoAuto();
  }

  /** Erro na atualizacao automatica: mantem os dados na tela e tenta no proximo ciclo */
  falhaAuto(msg: string): void {
    this.auto.emCurso = false;
    this.auto.proxima = Date.now() + this.auto.min * 60000;
    this.aviso(`A atualização automática falhou; os dados na tela são de antes. ${msg}`, true);
    this.textoAuto();
  }

  // ---------- dados ----------
  definirDados(r: LogResposta): void {
    // Automatica que chegou com pedido ou janela aberta (ou campo em edicao): trocar
    // os dados agora atrapalharia. Guarda e aplica quando liberar (verificarAuto).
    if (this.auto.emCurso) {
      this.auto.emCurso = false;
      const m = this.motivoEspera();
      if (m && m !== 'tela em segundo plano') {
        this.auto.pendente = r;
        this.auto.espera = m;
        this.textoAuto();
        return;
      }
    }
    this.auto.pendente = null;
    // Qualquer carga (manual ou automatica) reinicia a contagem e preserva a rolagem
    const rolagem = document.scrollingElement?.scrollTop ?? 0;
    const kb = this.el.conteudo.querySelector('.kb-quadro') as HTMLElement | null;
    const rolKb = kb ? kb.scrollLeft : 0;
    this.auto.emCurso = false;
    this.auto.espera = '';
    this.auto.proxima = Date.now() + this.auto.min * 60000;
    this.resp = r;
    this.faltando = new Set(r.camposFaltando || []);
    // API anterior a 2026-11-15a nao le nem grava especie e pesos: desliga os campos
    if (!r.versao || r.versao < '2026-11-15a') PARA_NFE.forEach((k) => this.faltando.add(CAMPO[k]));
    // API anterior a 2026-11-15b: sem C5_ZOBS e a saida programada ainda copia para o envio
    if (!r.versao || r.versao < '2026-11-15b') this.faltando.add(CAMPO.obsEntrega);
    // API anterior a 2026-11-23b: sem a observacao do retorno (ZLH_OBS)
    if (!r.versao || r.versao < '2026-11-23b') this.faltando.add(CAMPO.obsRetorno);
    // API anterior a 2026-11-25b: sem o tipo do frete (C5_TPFRETE)
    if (!r.versao || r.versao < '2026-11-25b') this.faltando.add(CAMPO.tipoFrete);
    // Com a tabela de custos, o CTE da SC5 nao e mais usado: nao avisa se faltar
    if (r.temCustos) ['C5_ZCTE', 'C5_ZVLRCTE', 'C5_ZCTEREE', 'C5_ZVCTERE'].forEach((c) => this.faltando.delete(c));
    this.regs = (r.pedidos || []).map((p) => this.montar(p));
    this.carregando = false;
    this.erroCarga = '';
    this.opcoesFiltros();
    this.el.faltam.hidden = !this.faltando.size;
    this.el.faltam.innerHTML = this.faltando.size
      ? `<p class="aviso"><b>Campos ainda não criados na SC5 deste ambiente:</b> ${esc([...this.faltando].join(', '))}. Eles aparecem vazios e a edição deles fica desligada.</p>`
      : '';
    this.desenhar();
    if (document.scrollingElement) document.scrollingElement.scrollTop = rolagem;
    const kb2 = this.el.conteudo.querySelector('.kb-quadro') as HTMLElement | null;
    if (kb2) kb2.scrollLeft = rolKb;
    this.textoAuto();
    // Gaveta aberta numa recarga: redesenha com o pedido novo (ou fecha se sumiu)
    if (this.aberto) {
      if (this.reg(this.aberto)) this.gaveta(this.aberto);
      else this.fecharCamada();
    }
  }

  marcarCarregando(): void {
    this.carregando = true;
    this.erroCarga = '';
    this.desenhar();
  }

  marcarErro(msg: string): void {
    this.carregando = false;
    this.erroCarga = msg;
    this.desenhar();
  }

  private montar(p: Pedido): Reg {
    const itens = p.itens || [];
    const temNota = (p.notas || []).length > 0;
    const reent = p.reentrega === 'SIM';
    const entFinal = reent ? p.dataNovaEntrega : p.dataEntrega;
    // retorno vem antes de tudo: a mercadoria voltou, mesmo que tenha data de entrega
    // finalizado sem entrega (24/11/2026): encerra o pedido sem a data de entrega
    const et: Etapa = p.dataRetorno ? 'ret' : entFinal ? 'ent' : p.finalizado === 'S' ? 'fin' : p.dataEnvio ? 'env' : temNota ? 'fat' : 'prev';
    let prazo: Prazo = '';
    let atraso: number | null = null;
    const prev = dt(p.dataPrevisao);
    if (et === 'ent' || et === 'env') {
      if (!prev) prazo = 'semprev';
      else if (et === 'ent') {
        atraso = dias(prev, dt(entFinal) as Date);
        prazo = atraso > 0 ? 'atrasado' : 'noprazo';
      } else {
        const falta = dias(this.hoje, prev);
        atraso = -falta;
        prazo = falta < 0 ? 'atrasado' : falta <= DIAS_VENCE ? 'vence' : 'noprazo';
      }
    }
    const produtos = [...new Set(itens.map((i) => i.descricao))].join(' · ');
    const cus = this.temCustos ? p.custos || [] : null;
    const abertos = cus ? cus.filter((c) => EM_ABERTO.includes(c.situacao)) : [];
    const ctes = cus ? cus.map((c) => (c.cte === SEM_CTE ? 'Sem CTE' : c.cte)).filter(Boolean) : [p.cte, p.cteReentrega].filter(Boolean);
    // envios parciais: etapa, prazo e entrega do pedido saem dos envios (NFs)
    const envs = this.envios(p);
    let etM = et;
    let prazoM = prazo;
    let atrasoM = atraso;
    let entFinalM = entFinal;
    if (envs.length) {
      const todos = envs.every((e) => e.et === 'ent');
      etM = p.dataRetorno ? 'ret' : todos ? 'ent' : p.finalizado === 'S' ? 'fin' : envs.some((e) => e.et === 'env') ? 'env' : 'fat';
      entFinalM = todos ? envs.map((e) => e.entFinal).sort().slice(-1)[0] || '' : '';
      const conta = etM === 'env' ? envs.filter((e) => e.et === 'env') : etM === 'ent' ? envs : [];
      const pior = conta.slice().sort((a, b) => RANK_PRAZO[b.prazo] - RANK_PRAZO[a.prazo] || (b.atraso ?? -999) - (a.atraso ?? -999))[0];
      prazoM = pior ? pior.prazo : '';
      atrasoM = pior ? pior.atraso : null;
    }
    const pend = this.pendencias(p, etM, prazoM, envs);
    return {
      p,
      et: etM,
      entFinal: entFinalM,
      prazo: prazoM,
      atraso: atrasoM,
      envs,
      cobrado: (p.frete || 0) + (p.freteNaoDestacado || 0),
      custo: cus ? cus.reduce((s, c) => s + (c.valor || 0), 0) : (p.valorCte || 0) + (p.valorCteReentrega || 0),
      nDiv: abertos.length,
      difDiv: abertos.filter((c) => c.valorEsperado > 0).reduce((s, c) => s + (c.valor - c.valorEsperado), 0),
      ctes,
      pend,
      qtd: itens.reduce((s, i) => s + (i.quantidade || 0), 0),
      valor: itens.reduce((s, i) => s + (i.valor || 0), 0),
      parcial: temNota && itens.some((i) => !i.nota),
      produtos,
      busca: normal(
        [p.pedido, p.nome, p.fantasia, p.cidade, p.uf, p.transportadoraNome, p.vendedor, p.grupo, ...ctes, ...(p.notas || []), produtos, p.nomeEntrega, p.pedidoReenvio, p.obsEntrega, p.obsRetorno, p.pedidoFinal, p.obsFinal, p.obsIndicador, p.mensagemNota, p.enderecoEntrega, p.bairroEntrega, p.telefone, p.telefoneCliente, ...itens.flatMap((i) => (i.numerosSerie || []).map((s) => s[0]))].join(' '),
      ),
    };
  }

  /** O que falta preencher no pedido, pela etapa (pedido do usuario, 23/11/2026).
   *  Campo que nao existe no ambiente nao conta. Transportadora, volume, especie e
   *  pesos so nos Previstos: com NF eles ja sairam no documento e nao editam aqui. */
  private pendencias(p: Pedido, et: Etapa, prazo: Prazo, envs: Env[] = []): Pend[] {
    const tem = (c: string) => !this.faltando.has(c);
    const out: Pend[] = [];
    if (et === 'prev') {
      if (!p.transportadora) out.push('transp');
      if (tem(CAMPO.volume) && !p.volume) out.push('volume');
      if (tem(CAMPO.especie) && !p.especie) out.push('especie');
      if ((tem(CAMPO.pesoLiquido) && !p.pesoLiquido) || (tem(CAMPO.pesoBruto) && !p.pesoBruto)) out.push('peso');
    }
    if (et === 'fat' && tem(CAMPO.dataEnvio) && p.dataFaturamento && dias(dt(p.dataFaturamento) as Date, this.hoje) > DIAS_FAT_PARADO) out.push('envio');
    if (et === 'env' || et === 'ent') {
      if (prazo === 'semprev' && tem(CAMPO.dataPrevisao)) out.push('previsao');
      if (et === 'env' && prazo === 'atrasado' && tem(CAMPO.dataEntrega)) out.push('entrega');
      if (et === 'env' && p.reentrega === 'SIM' && !p.dataNovaEntrega) out.push('novaData');
      // qualquer cobranca lancada (de qualquer tipo, com CTE, texto ou "Sem CTE") resolve (24/11/2026)
      if (this.temCustos ? !(p.custos || []).length : tem(CAMPO.cte) && !p.cte) out.push('cte');
      if (tem(CAMPO.tipoMaterial) && !p.tipoMaterial) out.push('tpmat');
      if (prazo === 'atrasado' && tem(CAMPO.indicador) && !p.indicador) out.push('indicador');
      if (tem(CAMPO.obsIndicador) && this.indOutros(p.indicador) && !(p.obsIndicador || '').trim()) out.push('descInd');
    }
    if (et === 'ret') {
      if (tem(CAMPO.motivoRetorno) && !p.motivoRetorno) out.push('motivo');
      if (tem(CAMPO.pedidoReenvio) && !p.pedidoReenvio) out.push('reenvio');
    }
    if (et === 'fin' && this.reembolsoPendente(p)) out.push('reembolso');
    if (!envs.length) return out;
    // envios parciais (25/11/2026): o que depende do envio e conferido em cada NF
    const porEnvio: Pend[] = [];
    envs.forEach((e) => {
      if (e.junto) return;
      if (e.et === 'fat') {
        if (e.dataFat && dias(dt(e.dataFat) as Date, this.hoje) > DIAS_FAT_PARADO) porEnvio.push('envio');
        return;
      }
      if (!e.dataPrevisao) porEnvio.push('previsao');
      if (e.et === 'env' && e.prazo === 'atrasado') porEnvio.push('entrega');
      if (this.temCustos && !e.custos.length) porEnvio.push('cte');
      if (!e.tipoMaterial) porEnvio.push('tpmat');
      if (e.prazo === 'atrasado' && !e.indicador) porEnvio.push('indicador');
    });
    const doEnvio: Pend[] = ['envio', 'previsao', 'entrega', 'cte', 'tpmat', 'indicador'];
    return [...new Set([...out.filter((k) => !doEnvio.includes(k)), ...porEnvio])];
  }

  /** Envios do pedido faturado em partes (uma NF por envio). O 1o envio (NF mais
   *  antiga) usa os campos da SC5; os outros vem da ZLE. Pedido de uma NF so: [] */
  private envios(p: Pedido): Env[] {
    const outros = p.envios || [];
    if (!outros.length) return [];
    const itens = p.itens || [];
    const nfP = p.nfPrincipal || '';
    const fatDe = (nf: string) => itens.filter((i) => i.nota === nf && i.dataFat).map((i) => i.dataFat).sort()[0] || '';
    const cus = p.custos || [];
    const qtdDe = (nf: string) => itens.filter((i) => i.nota === nf).reduce((s, i) => s + (i.quantidade || 0), 0);
    const principal = this.envio(0, nfP, '', fatDe(nfP), p.dataEnvio, p.dataPrevisao, p.reentrega === 'SIM' ? p.dataNovaEntrega : p.dataEntrega, p.tipoMaterial, p.indicador, p.transportadora, cus.filter((c) => !c.nf || c.nf === nfP), qtdDe(nfP));
    return [
      principal,
      ...outros.map((e, k) => {
        // emitida no mesmo dia da 1a e sem envio proprio lancado: saiu junto com o 1o envio
        if (!e.gravado && e.dataFat && e.dataFat === principal.dataFat) {
          return { ...principal, idx: k + 1, nf: e.nf, serie: e.serie, dataFat: e.dataFat, transportadora: e.transportadora || principal.transportadora, custos: cus.filter((c) => c.nf === e.nf), qtd: qtdDe(e.nf), junto: true };
        }
        return this.envio(k + 1, e.nf, e.serie, e.dataFat, e.dataEnvio, e.dataPrevisao, e.dataEntrega, e.tipoMaterial, e.indicador, e.transportadora, cus.filter((c) => c.nf === e.nf), qtdDe(e.nf));
      }),
    ];
  }

  private envio(idx: number, nf: string, serie: string, dataFat: string, dataEnvio: string, dataPrevisao: string, entFinal: string, tipoMaterial: string, indicador: string, transportadora: string, custos: Custo[], qtd: number): Env {
    const et: 'fat' | 'env' | 'ent' = entFinal ? 'ent' : dataEnvio ? 'env' : 'fat';
    let prazo: Prazo = '';
    let atraso: number | null = null;
    const prev = dt(dataPrevisao);
    if (et !== 'fat') {
      if (!prev) prazo = 'semprev';
      else if (et === 'ent') {
        atraso = dias(prev, dt(entFinal) as Date);
        prazo = atraso > 0 ? 'atrasado' : 'noprazo';
      } else {
        const falta = dias(this.hoje, prev);
        atraso = -falta;
        prazo = falta < 0 ? 'atrasado' : falta <= DIAS_VENCE ? 'vence' : 'noprazo';
      }
    }
    return { idx, nf, serie, dataFat, dataEnvio: dataEnvio || '', dataPrevisao: dataPrevisao || '', entFinal: entFinal || '', tipoMaterial: tipoMaterial || '', indicador: indicador || '', transportadora: transportadora || '', custos, qtd, junto: false, et, prazo, atraso };
  }

  /** Algum envio do pedido saiu hoje (o 1o ou um parcial) */
  private saiuHoje(r: Reg, hj: string): boolean {
    return r.p.dataEnvio === hj || r.envs.some((e) => e.dataEnvio === hj);
  }

  /** Envio da NF do item (pedido faturado em partes); undefined = pedido de uma NF so */
  private envioDoItem(r: Reg, i: ItemPedido): Env | undefined {
    return r.envs.length && i.nota ? r.envs.find((e) => e.nf === i.nota) : undefined;
  }

  /** Um registro por envio (para indicadores e XLSX): pedido de uma NF fica como esta;
   *  o faturado em partes vira um registro por NF, com as datas, a transportadora e
   *  as cobrancas daquele envio (o frete cobrado no pedido fica no 1o envio) */
  private porEnvio(regs: Reg[]): Reg[] {
    const transps = this.resp?.transportadoras || [];
    return regs.flatMap((r) => {
      if (!r.envs.length) return [r];
      const juntas = r.envs.filter((e) => e.junto).map((e) => e.nf);
      return r.envs.filter((e) => !e.junto).map((e) => {
        const prin = e.idx === 0;
        const nfsDoEnvio = prin ? [e.nf, ...juntas] : [e.nf];
        const p2: Pedido = {
          ...r.p,
          envios: [],
          nfPrincipal: e.nf,
          dataEnvio: e.dataEnvio,
          dataPrevisao: e.dataPrevisao,
          dataEntrega: prin ? r.p.dataEntrega : e.entFinal,
          reentrega: prin ? r.p.reentrega : 'NAO',
          dataNovaEntrega: prin ? r.p.dataNovaEntrega : '',
          dataRetorno: prin ? r.p.dataRetorno : '',
          finalizado: prin ? r.p.finalizado : '',
          transportadora: e.transportadora,
          transportadoraNome: transps.find(([k]) => k === e.transportadora)?.[1] || (prin ? r.p.transportadoraNome : e.transportadora),
          tipoMaterial: e.tipoMaterial,
          indicador: e.indicador,
          custos: e.custos,
          frete: prin ? r.p.frete : 0,
          freteNaoDestacado: prin ? r.p.freteNaoDestacado : 0,
          itens: (r.p.itens || []).filter((i) => nfsDoEnvio.includes(i.nota)),
          notas: nfsDoEnvio.filter(Boolean),
          dataFaturamento: e.dataFat,
        };
        return this.montar(p2);
      });
    });
  }

  /** Indicador de atraso escolhido e a opcao "Outros" (pede a descricao) */
  private indOutros(cod: string | undefined): boolean {
    return !!cod && ehOutros(this.txtOp('indicador', cod));
  }

  /** Extravio ainda sem reembolso resolvido (vazio ou Pendente) */
  private reembolsoPendente(p: Pedido): boolean {
    return p.finalizado === 'S' && p.motivoFinal === 'E' && p.reembolso !== 'S' && p.reembolso !== 'N';
  }

  /** Endereco de entrega numa linha: rua, complemento, bairro, cidade/UF e CEP */
  private enderecoTxt(p: Pedido, comCidade = true): string {
    const cep = (p.cepEntrega || '').replace(/\D/g, '');
    return [
      [p.enderecoEntrega, p.complementoEntrega].filter(Boolean).join(' - '),
      p.bairroEntrega,
      comCidade ? [p.cidade, p.uf].filter(Boolean).join('/') : '',
      cep ? `CEP ${cep.length === 8 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }

  private reg(recno: number): Reg | undefined {
    return this.regs.find((r) => r.p.recno === recno);
  }

  // ---------- opcoes ----------
  private op(k: TipoOp): Opcao[] {
    const v = this.resp?.opcoes?.[k] || [];
    if (v.length) return v;
    const padrao: Record<TipoOp, Opcao[]> = { tipoMaterial: TPMAT_PADRAO, indicador: INDICA_PADRAO, motivoRetorno: MOTRET_PADRAO, tipoPedido: TIPOPED_PADRAO, tipoFrete: TPFRETE_PADRAO, motivoFinal: MOTFIN_PADRAO, reembolso: REEMB_PADRAO };
    return padrao[k];
  }
  private txtOp(k: TipoOp, cod: string): string {
    if (!cod) return '';
    const o = this.op(k).find((x) => x[0] === cod);
    return o ? o[1] : cod;
  }
  private get temCustos(): boolean {
    return !!this.resp?.temCustos;
  }
  private opCusto(k: 'tipoCusto' | 'situacaoCusto'): Opcao[] {
    const v = this.resp?.opcoes?.[k] || [];
    return v.length ? v : k === 'tipoCusto' ? TIPOCUSTO_PADRAO : SITCUSTO_PADRAO;
  }
  private txtCusto(k: 'tipoCusto' | 'situacaoCusto', cod: string): string {
    if (!cod) return k === 'situacaoCusto' ? 'OK' : '';
    const o = this.opCusto(k).find((x) => x[0] === cod);
    return o ? o[1] : cod;
  }
  /** Telefone com link para discar (o numero vai so com digitos) */
  private foneHtml(t?: string): string {
    if (!t) return '<span class="muted">não cadastrado</span>';
    const d = t.replace(/\D/g, '');
    return d.length >= 8 ? `<a href="tel:${d}">${esc(t)}</a>` : esc(t);
  }
  /** CTE para os cartoes: o 1o da lista */
  private cteTxt(r: Reg): string {
    return r.ctes.length ? ` · ${r.ctes[0] === 'Sem CTE' ? '' : 'CTE '}${esc(r.ctes[0])}${r.ctes.length > 1 ? ` +${r.ctes.length - 1}` : ''}` : '';
  }
  private transpNome(r: Reg): string {
    return r.p.transportadoraNome || (r.p.transportadora ? `Cód. ${r.p.transportadora}` : 'Sem transportadora');
  }

  private opcoesFiltros(): void {
    const conta = (f: (r: Reg) => string) => {
      const m = new Map<string, number>();
      this.regs.forEach((r) => m.set(f(r), (m.get(f(r)) || 0) + 1));
      return m;
    };
    const lista = (m: Map<string, number>, txt: (k: string) => string): [string, string][] =>
      [...m.entries()].map(([k, n]): [string, string] => [k, `${txt(k)} (${n0(n)})`]).sort((a, b) => a[1].localeCompare(b[1]));
    this.opsMulti = {
      transp: lista(conta((r) => r.p.transportadora || '-'), (k) => (k === '-' ? 'Sem transportadora' : this.regs.find((r) => r.p.transportadora === k)?.p.transportadoraNome || k)),
      uf: lista(conta((r) => r.p.uf || '-'), (k) => (k === '-' ? '(sem UF)' : k)),
      tpmat: lista(conta((r) => r.p.tipoMaterial || '-'), (k) => (k === '-' ? 'Não informado' : this.txtOp('tipoMaterial', k))),
      tipo: lista(conta((r) => r.p.tipoPedido || '-'), (k) => (k === '-' ? 'Não informado' : this.txtOp('tipoPedido', k))),
      situacao: this.temCustos ? [...SITUACOES, SIT_CUSTO] : SITUACOES,
    };
    MULTI.forEach(([k]) => {
      // tira da selecao o que nao existe mais nos dados
      this.e[k] = this.e[k].filter((v) => this.opsMulti[k].some(([o]) => o === v));
      this.desenharMulti(k);
    });
  }

  /** Lista de caixas de um filtro de multipla escolha + texto do botao.
   *  soTexto: so o botao e o contador (ao marcar uma caixa: nao troca os elementos, o foco fica) */
  private desenharMulti(k: FiltroMulti, soTexto = false): void {
    const box = this.raiz.querySelector(`[data-multi="${k}"]`);
    if (!box) return;
    const sel = this.e[k];
    const ops = this.opsMulti[k];
    const todos = (MULTI.find((m) => m[0] === k) as [FiltroMulti, string, string])[2];
    const painel = box.querySelector('.multi-painel') as HTMLElement;
    const marcados = sel.length ? `${n0(sel.length)} marcado${sel.length > 1 ? 's' : ''}` : 'nenhum marcado';
    if (soTexto) {
      const c = painel.querySelector('.multi-conta');
      if (c) c.textContent = marcados;
    } else {
      painel.innerHTML =
        `<div class="multi-acoes"><button type="button" class="btn-txt" data-multi-limpar="${k}">${esc(todos)} (limpar)</button><span class="muted multi-conta">${marcados}</span></div>` +
        (ops.length
          ? ops.map(([v, t]) => `<label class="multi-op"><input type="checkbox" data-multi-op="${k}" value="${esc(v)}" ${sel.includes(v) ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('')
          : '<p class="muted">Sem opções.</p>');
    }
    const txt = box.querySelector('.multi-txt') as HTMLElement;
    const sem = (t: string) => t.replace(/ \([\d.]+\)$/, '');
    txt.textContent = !sel.length ? todos : sel.length === 1 ? sem(ops.find(([v]) => v === sel[0])?.[1] || sel[0]) : `${n0(sel.length)} selecionados`;
    box.classList.toggle('ativo', sel.length > 0);
  }

  private fecharMultis(exceto?: Element): void {
    this.raiz.querySelectorAll('.multi').forEach((m) => {
      if (m === exceto) return;
      (m.querySelector('.multi-painel') as HTMLElement).hidden = true;
      m.querySelector('.multi-btn')?.setAttribute('aria-expanded', 'false');
    });
  }

  /** Data usada pelo filtro de data da tela */
  private dataFiltro(r: Reg): string {
    return this.e.fData === 'emissao' ? r.p.emissao : this.e.fData === 'entrega' ? r.entFinal : r.p.dataPrevisao;
  }

  /** Registros depois dos filtros do topo */
  private base(): Reg[] {
    const q = normal(this.e.busca.trim());
    // Busca so com numero de ate 6 digitos que e um pedido: so esse pedido (pedido do
    // usuario, 24/11/2026: "000287" trazia tambem as NFs 000002871... de outros pedidos)
    const pedExato = /^\d{1,6}$/.test(q) ? q.padStart(6, '0') : '';
    const soPedido = !!pedExato && this.regs.some((r) => r.p.pedido === pedExato);
    const { transp, uf, tpmat, tipo, situacao, fDe, fAte } = this.e;
    const em = (lista: string[], v: string) => !lista.length || lista.includes(v);
    return this.regs.filter((r) => {
      if (soPedido ? r.p.pedido !== pedExato : q && !r.busca.includes(q)) return false;
      if (!em(transp, r.p.transportadora || '-') || !em(uf, r.p.uf || '-') || !em(tpmat, r.p.tipoMaterial || '-') || !em(tipo, r.p.tipoPedido || '-')) return false;
      if (situacao.length && !situacao.includes(r.prazo) && !(situacao.includes('custodiv') && r.nDiv > 0)) return false;
      if (fDe || fAte) {
        const d = this.dataFiltro(r);
        if (!d || (fDe && d < fDe) || (fAte && d > fAte)) return false;
      }
      return true;
    });
  }

  // ---------- montagem ----------
  desenhar(): void {
    const t = this.tela;
    this.el.abas.innerHTML = ABAS.map(([id, nome]) => `<a href="#${id}" data-tela="${id}" ${id === t ? 'aria-current="page"' : ''}>${nome}</a>`).join('');
    const g = this.resp?.geradoEm || '';
    this.el.sub.textContent = g ? `Gerado em ${g.slice(8, 10)}/${g.slice(5, 7)} ${g.slice(11, 16)} · ${n0(this.regs.length)} pedidos` : '';
    if (this.erroCarga) {
      this.el.conteudo.innerHTML = `<section class="painel"><div class="corpo"><p class="erro"><b>Não foi possível consultar os dados.</b> ${esc(this.erroCarga)}</p><p class="nota">Veja o Diagnóstico no topo para o endereço do REST e o token.</p></div></section>`;
      return;
    }
    if (this.carregando && !this.regs.length) {
      this.el.conteudo.innerHTML = `<section class="painel"><div class="corpo"><p class="muted">Consultando os pedidos…</p></div></section>`;
      return;
    }
    const telas: Record<string, () => string> = {
      quadros: () => this.telaQuadros(),
      programacao: () => this.telaProgramacao(),
      entregas: () => this.telaEntregas(),
      lista: () => this.telaLista(),
      indicadores: () => this.telaIndicadores(),
    };
    this.el.conteudo.innerHTML = (this.carregando ? `<p class="aviso">Atualizando…</p>` : '') + (telas[t] || telas['quadros'])();
  }

  // ---------- Quadros ----------
  private telaQuadros(): string {
    const regs = this.base();
    const hj = iso(this.hoje);
    const g = this.e.fGlobal;
    const cards = this.cardsQuadros(regs);
    const cardAtivo = cards.find((c) => c.id === g);
    const visiveis = cardAtivo ? regs.filter(cardAtivo.f) : regs;
    const limEnt = new Date(this.hoje.getTime() - DIAS_ENTREGUES * 86400000);
    const cols = COLUNAS_QUADRO.map((et0) => {
      // a coluna dos retornados tambem mostra os finalizados sem entrega (24/11/2026)
      const et = et0.id === 'ret' ? { ...et0, ...COL_RET } : et0;
      const opcoes = ORD_QUADRO[et.id];
      const [, , chave, asc] = opcoes.find((o) => o[0] === this.e.ordQuadro[et.id]) || opcoes[0];
      const daEtapa = visiveis.filter((r) => r.et === et.id || (et.id === 'ret' && r.et === 'fin'));
      // filtro da coluna: so as opcoes que tem pedido (e a escolhida, mesmo zerada)
      const fq = this.e.fQuadro[et.id];
      const nPend = daEtapa.filter((r) => r.pend.length).length;
      const opsF: [string, string][] = [['', `Mostrar todos (${n0(daEtapa.length)})`]];
      if (nPend || fq === 'pend') opsF.push(['pend', `Com informação faltando (${n0(nPend)})`]);
      PEND_ORDEM.forEach((k) => {
        const n = daEtapa.filter((r) => r.pend.includes(k)).length;
        if (n || fq === k) opsF.push([k, `${PEND_TXT[k][0]} (${n0(n)})`]);
      });
      const filtroQ =
        opsF.length > 1
          ? `<select class="ord-quadro filtro-quadro${fq ? ' ativo' : ''}" data-filtro-quadro="${et.id}" aria-label="Filtro de ${esc(et.nome)}">${opsF
              .map(([id, txt]) => `<option value="${id}" ${id === fq ? 'selected' : ''}>${esc(txt)}</option>`)
              .join('')}</select>`
          : '';
      let lista = daEtapa
        .filter((r) => (!fq ? true : fq === 'pend' ? r.pend.length > 0 : r.pend.includes(fq as Pend)))
        .sort((a, b) => {
          const c = chave(a).localeCompare(chave(b)) || a.p.pedido.localeCompare(b.p.pedido);
          return asc ? c : -c;
        });
      const seletor = `<select class="ord-quadro" data-ord-quadro="${et.id}" aria-label="Ordem de ${esc(et.nome)}">${opcoes
        .map(([id, txt]) => `<option value="${id}" ${id === this.e.ordQuadro[et.id] ? 'selected' : ''}>${esc(txt)}</option>`)
        .join('')}</select>`;
      const total = lista.length;
      const qtd = lista.reduce((s, r) => s + r.qtd, 0);
      let ocultosEnt = 0;
      // com filtro ligado os entregues antigos aparecem: e la que falta informacao.
      // Com texto na busca tambem (24/11/2026): o pedido buscado tem que aparecer
      // no quadro, mesmo entregue ha mais de DIAS_ENTREGUES dias
      if (et.id === 'ent' && !this.e.entTodos && !fq && !g && !this.e.busca.trim()) {
        const recentes = lista.filter((r) => (dt(r.entFinal) as Date) >= limEnt);
        ocultosEnt = lista.length - recentes.length;
        lista = recentes;
      }
      const lim = this.e.limQuadro[et.id];
      const cartoes = lista.slice(0, lim).map((r) => this.cartao(r)).join('');
      const mais = lista.length > lim ? `<button class="btn-txt" data-mais-quadro="${et.id}">Mostrar mais ${n0(Math.min(LIMITE_CARTOES, lista.length - lim))} de ${n0(lista.length - lim)}</button>` : '';
      const entInfo =
        et.id === 'ent'
          ? this.e.entTodos
            ? `<button class="btn-txt" data-acao="ent-recentes">Só os últimos ${DIAS_ENTREGUES} dias</button>`
            : ocultosEnt
              ? `<button class="btn-txt" data-acao="ent-todos">Mostrar também ${n0(ocultosEnt)} mais antigos</button>`
              : ''
          : '';
      return `<section class="quadro" style="--cor:${et.cor}" aria-label="${esc(et.nome)}">
        <header><h2><span>${esc(et.nome)}</span><span class="q num">${n0(total)}</span></h2><p>${esc(et.desc)} · ${n0(qtd)} un${fq ? ` · filtrado de ${n0(daEtapa.length)}` : ''}</p>${seletor}${filtroQ}${entInfo ? `<p>${entInfo}</p>` : ''}</header>
        <div class="lista">${cartoes || '<p class="muted vazio">Nenhum pedido.</p>'}${mais ? `<div class="mais">${mais}</div>` : ''}</div>
      </section>`;
    });
    // Enviados hoje logo depois dos Enviados (ETAPAS: prev, fat, env, ent, ret)
    cols.splice(3, 0, this.quadroHoje(visiveis, hj));
    // todos os cards filtram os quadros: clicar liga; clicar de novo desliga (23/11/2026)
    const kpis = cards
      .map((c) => {
        const n = regs.filter(c.f).length;
        const on = g === c.id;
        const sub = on ? '<b>filtrando os quadros · clique para tirar</b>' : `${c.s}${n ? ' · clique para ver' : ''}`;
        return `<button type="button" class="kpi${c.crit && n ? ' crit' : ''}${on ? ' ativo' : ''}" data-acao="filtro-global" data-valor="${c.id}" aria-pressed="${on}"><div class="r">${c.r}</div><div class="v">${n0(n)}</div><div class="s">${sub}</div></button>`;
      })
      .join('');
    const nAtivo = cardAtivo ? visiveis.length : 0;
    const faixa = cardAtivo ? `Mostrando só os ${n0(nAtivo)} pedido${nAtivo === 1 ? '' : 's'}: ${cardAtivo.r.toLowerCase()}.${cardAtivo.id === 'pend' ? ' Em cada quadro, o filtro escolhe qual informação.' : ''}` : '';
    return `<div class="resumo">${kpis}</div>
      ${faixa ? `<p class="filtro-ativo" role="status"><span>${esc(faixa)}</span><button type="button" class="btn-txt" data-acao="filtro-global" data-valor="">Mostrar todos</button></p>` : ''}
      <div class="quadros">${cols.join('')}</div>`;
  }

  /** Cartoes do topo dos Quadros. Todos filtram os quadros ao clicar (pedido do
   *  usuario, 23/11/2026). [id, titulo, texto menor, filtro, critico se > 0] */
  private cardsQuadros(regs: Reg[]): { id: string; r: string; s: string; f: (r: Reg) => boolean; crit: boolean }[] {
    const hj = iso(this.hoje);
    const hoje = regs.filter((r) => this.saiuHoje(r, hj));
    const un = hoje.reduce((s, r) => s + r.qtd, 0);
    const tr = new Set(hoje.map((r) => r.p.transportadora || '-')).size;
    const div = this.temCustos ? regs.filter((r) => r.nDiv > 0) : [];
    const dif = div.reduce((s, r) => s + r.difDiv, 0);
    const out: { id: string; r: string; s: string; f: (r: Reg) => boolean; crit: boolean }[] = [
      { id: 'pend', r: 'Com informação faltando', s: 'transportadora, peso, datas, CTE…', f: (r) => r.pend.length > 0, crit: true },
      { id: 'hoje', r: 'Saíram hoje', s: hoje.length ? `${n0(un)} un · ${n0(tr)} transportadora${tr === 1 ? '' : 's'}` : 'nenhum envio com a data de hoje', f: (r) => this.saiuHoje(r, hj), crit: false },
      { id: 'atr', r: 'Em trânsito atrasados', s: 'passaram da previsão da transportadora', f: (r) => r.et === 'env' && r.prazo === 'atrasado', crit: true },
      { id: 'vence', r: 'Vencem em até 2 dias', s: 'em trânsito, perto da previsão', f: (r) => r.et === 'env' && r.prazo === 'vence', crit: false },
      { id: 'fatpar', r: 'Faturados parados', s: 'com NF há mais de 2 dias, sem envio', f: (r) => r.et === 'fat' && !!r.p.dataFaturamento && dias(dt(r.p.dataFaturamento) as Date, this.hoje) > DIAS_FAT_PARADO, crit: true },
      { id: 'semprev', r: 'Sem previsão de entrega', s: 'enviados sem a data da transportadora', f: (r) => r.et === 'env' && r.prazo === 'semprev', crit: false },
    ];
    if (!PARA_NFE.every((k) => this.faltando.has(CAMPO[k])))
      out.push({ id: 'nfe', r: 'Sem dados para a NF-e', s: 'sem NF e falta espécie, peso líquido ou bruto', f: (r) => this.faltaNfe(r.p).length > 0, crit: true });
    out.push({ id: 'aguarda', r: 'Aguardando reenvio', s: 'voltaram e ainda sem o pedido do reenvio', f: (r) => r.et === 'ret' && !r.p.pedidoReenvio, crit: true });
    // extravio finalizado sem reembolso resolvido (24/11/2026)
    if (!this.faltando.has(CAMPO.reembolso)) {
      const pendR = regs.filter((r) => r.et === 'fin' && this.reembolsoPendente(r.p));
      const vR = pendR.reduce((s, r) => s + (r.p.valorReembolso || 0), 0);
      out.push({ id: 'reemb', r: 'Reembolsos pendentes', s: pendR.length ? `extravios ainda sem reembolso${vR ? ` · ${rs0(vR)} informados` : ''}` : 'nenhum extravio aguardando reembolso', f: (r) => r.et === 'fin' && this.reembolsoPendente(r.p), crit: true });
    }
    if (this.temCustos)
      out.push({ id: 'custodiv', r: 'Custo de frete em divergência', s: div.length ? `pedidos em contato com a transportadora${dif ? ` · ${rs0(dif)} acima do esperado` : ''}` : 'nenhuma cobrança divergente', f: (r) => r.nDiv > 0, crit: true });
    return out;
  }

  /** Quadro "Enviados hoje" (pedido do usuario, 23/11/2026): pedidos com data de
   *  envio de hoje, em qualquer etapa (o que ja foi entregue hoje tambem), depois
   *  dos Enviados. O pedido continua tambem no quadro da etapa dele. */
  private quadroHoje(regs: Reg[], hj: string): string {
    const lista = regs
      .filter((r) => this.saiuHoje(r, hj))
      .sort((a, b) => this.transpNome(a).localeCompare(this.transpNome(b)) || a.p.pedido.localeCompare(b.p.pedido));
    const un = lista.reduce((s, r) => s + r.qtd, 0);
    const tr = new Set(lista.map((r) => r.p.transportadora || '-')).size;
    return `<section class="quadro" id="q-hoje" style="--cor:${COR_HOJE}" aria-label="Enviados hoje">
        <header><h2><span>Enviados hoje</span><span class="q num">${n0(lista.length)}</span></h2><p>Data de envio de hoje (${fmt(hj)}) · ${n0(un)} un${lista.length ? ` · ${n0(tr)} transportadora${tr === 1 ? '' : 's'}` : ''}</p></header>
        <div class="lista">${lista.map((r) => this.cartao(r, true)).join('') || '<p class="muted vazio">Nenhum pedido saiu hoje.</p>'}</div>
      </section>`;
  }

  private cartao(r: Reg, comEtapa = false): string {
    const p = r.p;
    const pills: string[] = [];
    // no quadro Enviados hoje: a etapa do pedido (Enviado, Entregue...)
    if (comEtapa) pills.push(`<span class="pill etapa" style="--cor:${ET[r.et].cor}">${esc(ET[r.et].curto)}</span>`);
    if (p.tipoNf && p.tipoNf !== 'N') pills.push(`<span class="pill semprev">${esc(TIPO_NF[p.tipoNf] || `Tipo ${p.tipoNf}`)}</span>`);
    if (p.tipoMaterial) pills.push(`<span class="pill mat">${esc(this.txtOp('tipoMaterial', p.tipoMaterial))}</span>`);
    if (r.prazo && r.prazo !== 'noprazo') pills.push(this.pillPrazo(r, true));
    if (p.reentrega === 'SIM') pills.push(`<span class="pill reent">Reentrega</span>`);
    if (r.parcial) pills.push(`<span class="pill semprev">NF parcial</span>`);
    if (r.envs.length) {
      // NF que saiu junto com o 1o envio nao conta como envio a parte
      const distintos = r.envs.filter((e) => !e.junto);
      const sairam = distintos.filter((e) => e.dataEnvio).length;
      const tit = `Pedido faturado em ${r.envs.length} NFs: ${r.envs.map((e) => `NF ${e.nf} ${e.junto ? 'junto com o 1º envio' : e.et === 'ent' ? 'entregue' : e.et === 'env' ? 'em trânsito' : 'aguardando saída'}`).join('; ')}`;
      pills.push(`<span class="pill mat" title="${esc(tit)}">${distintos.length > 1 ? `${sairam} de ${distintos.length} envios` : `${r.envs.length} NFs no mesmo envio`}</span>`);
    }
    if (r.et === 'ret' && !p.pedidoReenvio) pills.push(`<span class="pill atrasado">Aguardando reenvio</span>`);
    if (r.et === 'ret' && p.motivoRetorno) pills.push(`<span class="pill semprev">${esc(this.txtOp('motivoRetorno', p.motivoRetorno))}</span>`);
    if (r.et === 'fin') pills.push(...this.pillsFinal(p));
    const falta = r.pend.filter((k) => k !== 'reenvio' && k !== 'reembolso');
    if (falta.length) {
      const lista = falta.map((k) => PEND_TXT[k][1]).join(', ');
      pills.push(`<span class="pill falta" title="Falta: ${esc(lista)}">${esc(falta.length === 1 ? `Falta ${PEND_TXT[falta[0]][1]}` : `Faltam ${falta.length} informações`)}</span>`);
    }
    let datas = '';
    if (r.et === 'prev') datas = p.previsaoSaida ? `Saída programada ${fmtCurto(p.previsaoSaida)}` : `Emitido ${fmtCurto(p.emissao)}`;
    else if (r.et === 'fat') datas = `NF ${esc((p.notas || []).join(', '))} · ${fmtCurto(p.dataFaturamento)}${p.dataFaturamento ? ` (há ${dias(dt(p.dataFaturamento) as Date, this.hoje)} d)` : ''}`;
    else if (r.et === 'env') datas = `Envio ${fmtCurto(p.dataEnvio)} · Previsão ${p.dataPrevisao ? fmtCurto(p.dataPrevisao) : '–'}`;
    else if (r.et === 'ret') datas = `Retornou ${fmtCurto(p.dataRetorno || '')} (há ${dias(dt(p.dataRetorno || '') as Date, this.hoje)} d)${p.pedidoReenvio ? ` · Reenvio no pedido ${esc(p.pedidoReenvio)}` : ''}`;
    else if (r.et === 'fin')
      datas = `Finalizado ${fmtCurto(p.dataFinal || '')}${p.dataEnvio ? ` · Envio ${fmtCurto(p.dataEnvio)}` : ''}${p.pedidoFinal ? ` · Foi no pedido ${esc(p.pedidoFinal)}` : ''}`;
    else datas = `Entregue ${fmtCurto(r.entFinal)}${p.dataPrevisao ? ` · Previsão ${fmtCurto(p.dataPrevisao)}` : ''}`;
    return `<button type="button" class="cartao" data-ped="${p.recno}" style="--cor:${ET[r.et].cor}">
      <span class="l1"><b class="mono">${esc(p.pedido)}</b>${pills.join('')}</span>
      <span class="cli" title="${esc(p.nome)}">${esc(p.fantasia || p.nome || '(sem nome)')}</span>
      <span class="m">${esc([p.cidade, p.uf].filter(Boolean).join('/') || 'sem cidade')} · ${esc(this.transpNome(r))}</span>
      <span class="m">${n0(r.qtd)} un · ${rs0(r.valor)}${this.cteTxt(r)}${r.nDiv ? ' · <b class="crit-txt">custo em divergência</b>' : ''}</span>
      <span class="m">${datas}</span>
    </button>`;
  }

  /** Selos do finalizado sem entrega: motivo e, no extravio, o reembolso */
  private pillsFinal(p: Pedido): string[] {
    const out: string[] = [];
    if (p.motivoFinal) out.push(`<span class="pill ${p.motivoFinal === 'E' ? 'atrasado' : 'semprev'}">${esc(this.txtOp('motivoFinal', p.motivoFinal))}</span>`);
    if (p.motivoFinal === 'E') {
      if (this.reembolsoPendente(p)) out.push(`<span class="pill atrasado">Reembolso pendente${p.valorReembolso ? ` · ${rs0(p.valorReembolso)}` : ''}</span>`);
      else if (p.reembolso === 'S') out.push(`<span class="pill noprazo">Reembolsado${p.valorReembolso ? ` · ${rs0(p.valorReembolso)}` : ''}</span>`);
      else out.push(`<span class="pill semprev">Sem reembolso</span>`);
    }
    return out;
  }

  private pillPrazo(r: Reg, curto = false): string {
    if (!r.prazo) return '';
    let t = PRAZO_TXT[r.prazo];
    if (r.prazo === 'atrasado' && r.atraso !== null) t = curto ? `Atrasado ${r.atraso} d` : `Atrasado ${r.atraso} dia${r.atraso === 1 ? '' : 's'}`;
    if (r.prazo === 'vence' && r.atraso !== null) t = -r.atraso === 0 ? 'Vence hoje' : `Vence em ${-r.atraso} d`;
    return `<span class="pill ${r.prazo}">${esc(t)}</span>`;
  }

  // ---------- Programacao (kanban de saidas + entregas previstas para hoje) ----------
  // Pedido do usuario (15/11/2026): ver o que esta programado para sair em cada
  // dia e o que saiu ou nao. C5_FECENT = saida PROGRAMADA; o envio (C5_ZDTENV) so
  // e gravado no "Saiu". O que passou do dia sem sair cai em "Nao sairam"
  // sozinho; arrastar para outro dia reprograma.
  private diasProgramacao(): string[] {
    const out: string[] = [];
    const d = new Date(this.hoje);
    while (out.length < 5) {
      const fds = d.getDay() === 0 || d.getDay() === 6;
      if (!fds || iso(d) === iso(this.hoje)) out.push(iso(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  private telaProgramacao(): string {
    const hj = iso(this.hoje);
    // finalizado sem entrega nao sai mais: fora da programacao (24/11/2026)
    const regs = this.base().filter((r) => r.et !== 'fin');
    const apiVelha = !this.resp?.versao || this.resp.versao < '2026-11-15b';
    const dias0 = this.diasProgramacao();
    // fim de semana dentro do periodo so aparece se tiver pedido programado
    const fimFaixa = dias0[dias0.length - 1];
    const comFds = [...new Set(regs.map((r) => r.p.previsaoSaida).filter((d) => d && d > hj && d < fimFaixa && !dias0.includes(d)))];
    const dias = [...dias0, ...comFds].sort();
    const pend = (r: Reg) => !r.p.dataEnvio;
    const naoSairamTodos = regs.filter((r) => r.p.previsaoSaida && r.p.previsaoSaida < hj && pend(r)).sort((a, b) => a.p.previsaoSaida.localeCompare(b.p.previsaoSaida));
    // filtro digitado da coluna "Nao sairam" (pedido do usuario, 23/11/2026): mesma busca do topo
    const qNao = normal(this.fNaoSairam.trim());
    const naoSairam = qNao ? naoSairamTodos.filter((r) => r.busca.includes(qNao)) : naoSairamTodos;
    const doDia = (d: string) =>
      regs
        .filter((r) => r.p.previsaoSaida === d || (d === hj && r.p.dataEnvio === hj && r.p.previsaoSaida !== hj))
        .sort((a, b) => Number(!pend(a)) - Number(!pend(b)) || a.p.pedido.localeCompare(b.p.pedido));
    const depois = regs.filter((r) => r.p.previsaoSaida > fimFaixa && pend(r)).sort((a, b) => a.p.previsaoSaida.localeCompare(b.p.previsaoSaida));
    // sem programacao: so o que ainda nao saiu; faturados primeiro (ja podem sair)
    const semTodos = regs
      .filter((r) => !r.p.previsaoSaida && pend(r) && (r.et === 'prev' || r.et === 'fat'))
      .sort((a, b) => Number(a.et !== 'fat') - Number(b.et !== 'fat') || a.p.emissao.localeCompare(b.p.emissao));
    const sem = semTodos.slice(0, this.limSemProg);
    const sem_fat = semTodos.filter((r) => r.et === 'fat').length;
    const hoje = doDia(hj);
    const sairamHoje = hoje.filter((r) => !pend(r)).length;
    const entHoje = regs
      .filter((r) => r.p.dataPrevisao === hj && (r.et === 'env' || r.et === 'ent'))
      .sort((a, b) => Number(a.et === 'ent') - Number(b.et === 'ent') || a.p.pedido.localeCompare(b.p.pedido));
    const entregues = entHoje.filter((r) => r.et === 'ent').length;
    const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
    const rotDia = (d: string) => (d === hj ? `Hoje · ${fmtCurto(d)}` : `${SEMANA[(dt(d) as Date).getDay()]} · ${fmtCurto(d)}`);
    // id das colunas que os cards abrem
    const idCol = (dia: string, titulo: string) => {
      const i = dia === hj ? 'kb-hoje' : dia === '-' ? 'kb-sem' : titulo === 'Não saíram' ? 'kb-nao' : '';
      return i ? `id="${i}"` : '';
    };
    const coluna = (dia: string, titulo: string, sub: string, cor: string, itens: Reg[], extra = '', soltar = true, cab = '') =>
      `<section class="quadro kb-col" ${idCol(dia, titulo)} ${soltar && !apiVelha ? `data-dia="${dia}"` : ''} style="--cor:${cor}" aria-label="${esc(titulo)}">
        <header><h2><span>${esc(titulo)}</span><span class="q num">${n0(itens.length)}</span></h2><p>${sub}</p>${cab}</header>
        <div class="lista">${itens.map((r) => this.cartaoKb(r, dia, apiVelha)).join('') || `<p class="muted vazio">${soltar && !apiVelha ? 'Arraste pedidos para cá.' : 'Nenhum pedido.'}</p>`}${extra}</div>
      </section>`;
    // cards: clicar leva a coluna dos pedidos (pedido do usuario, 23/11/2026)
    const kpi = (r: string, v: string, s: string, crit: boolean, alvo: string) =>
      `<button type="button" class="kpi${crit ? ' crit' : ''}" data-acao="ir" data-alvo="${alvo}"><div class="r">${r}</div><div class="v">${v}</div><div class="s">${s} · clique para ver</div></button>`;
    const cols = [
      coluna(
        '',
        'Não saíram',
        qNao ? `${n0(naoSairam.length)} de ${n0(naoSairamTodos.length)} · filtrado` : 'saída programada já passou e sem envio',
        '#b3261e',
        naoSairam,
        '',
        false,
        `<input type="search" id="kb-filtro-nao" class="ord-quadro filtro-kb${qNao ? ' ativo' : ''}" value="${esc(this.fNaoSairam)}" placeholder="Filtrar: pedido, cliente, cidade…" aria-label="Filtrar os pedidos que não saíram" autocomplete="off">`,
      ),
      ...dias.map((d) => {
        const it = doDia(d);
        const saiu = it.filter((r) => !pend(r)).length;
        return coluna(d, rotDia(d), d === hj ? `${n0(saiu)} saíram · ${n0(it.length - saiu)} falta sair` : `${n0(it.reduce((s, r) => s + r.qtd, 0))} un programadas`, d === hj ? '#0b6e99' : '#5b8db8', it);
      }),
      coluna('', 'Depois', `programados depois de ${fmtCurto(fimFaixa)}`, '#8a94a0', depois, '', false),
      coluna(
        '-',
        'Sem programação',
        `${n0(semTodos.length)} sem data de saída · ${n0(sem_fat)} já com NF`,
        '#c8a400',
        sem,
        semTodos.length > sem.length ? `<div class="mais"><button class="btn-txt" data-kb="mais" data-rec="0">Mostrar mais ${n0(Math.min(LIMITE_CARTOES, semTodos.length - sem.length))} de ${n0(semTodos.length - sem.length)}</button></div>` : '',
      ),
    ].join('');
    const entCartoes = entHoje.map((r) => this.cartaoKb(r, 'ent', apiVelha)).join('');
    return `${apiVelha ? '<p class="aviso"><b>A programação está só para consulta:</b> o Protheus ainda está com a versão anterior da consulta de logística, que copia a saída programada para a data de envio. Compile o RESTLOGREL.tlpp 2026-11-15b para arrastar e marcar "Saiu" por aqui.</p>' : ''}
      <div class="resumo">
        ${kpi('Saem hoje', n0(hoje.length), `${n0(sairamHoje)} saíram · ${n0(hoje.length - sairamHoje)} falta sair`, false, 'kb-hoje')}
        ${kpi('Não saíram', n0(naoSairamTodos.length), 'saída programada passou sem envio', naoSairamTodos.length > 0, 'kb-nao')}
        ${kpi('Entregas previstas hoje', n0(entHoje.length), `${n0(entregues)} entregues · ${n0(entHoje.length - entregues)} em trânsito`, false, 'kb-ent')}
        ${kpi('Com NF sem programação', n0(sem_fat), 'faturados ainda sem data de saída', sem_fat > 0, 'kb-sem')}
      </div>
      <section class="painel">
        <header><h2>Programação de saídas</h2><p>Saída programada = data de saída do pedido (C5_FECENT). Arraste o cartão para o dia em que ele deve sair, ou para "Sem programação" para tirar a data. "Saiu" grava a data de envio de hoje. Clique no cartão para abrir o pedido.</p></header>
        <div class="kb-quadro">${cols}</div>
      </section>
      <section class="painel" id="kb-ent">
        <header><h2>Entregas previstas para hoje · ${fmt(hj)}</h2><p>Pedidos enviados com a previsão da transportadora (C5_ZDTPREV) para hoje. "Entregue" grava a data de entrega de hoje (a nova data, quando houve reentrega).</p></header>
        <div class="corpo">${entCartoes ? `<div class="kb-grade">${entCartoes}</div>` : '<p class="muted">Nenhuma entrega prevista para hoje.</p>'}</div>
      </section>`;
  }

  /** Cartao da programacao. onde = dia da coluna, '' (nao sairam/depois), '-' (sem programacao) ou 'ent' (entregas de hoje) */
  private cartaoKb(r: Reg, onde: string, soLeitura: boolean): string {
    const p = r.p;
    const hj = iso(this.hoje);
    const ocupado = this.ocupados.has(p.recno);
    const saiu = !!p.dataEnvio;
    const pills: string[] = [];
    if (onde !== 'ent') {
      if ((p.notas || []).length) pills.push(`<span class="pill mat">NF ${esc((p.notas || []).join(', '))}</span>`);
      else pills.push('<span class="pill semprev">Sem NF</span>');
      if (this.faltaNfe(p).length) pills.push('<span class="pill atrasado" title="Espécie, peso líquido ou peso bruto vazio">Falta dado da NF-e</span>');
    } else if (r.prazo) pills.push(this.pillPrazo(r, true));
    let linha = '';
    let botao = '';
    if (onde === 'ent') {
      if (r.et === 'ent') linha = `<span class="kb-st ok">✓ Entregue ${fmtCurto(r.entFinal)}</span>`;
      else {
        linha = `<span class="m">Enviado ${fmtCurto(p.dataEnvio)}${this.cteTxt(r)}</span>`;
        botao = `<button type="button" class="btn pri kb-btn" data-kb="entregue" data-rec="${p.recno}" ${ocupado || soLeitura ? 'disabled' : ''}>${ocupado ? 'Gravando…' : 'Entregue'}</button>`;
      }
    } else if (saiu) {
      const atrasou = p.previsaoSaida && p.dataEnvio > p.previsaoSaida;
      linha = `<span class="kb-st ok">✓ Saiu ${fmtCurto(p.dataEnvio)}${p.previsaoSaida !== p.dataEnvio ? ` <span class="muted">(programado ${p.previsaoSaida ? fmtCurto(p.previsaoSaida) : 'sem data'}${atrasou ? ', saiu atrasado' : ''})</span>` : ''}</span>`;
      if (p.dataEnvio === hj && !r.entFinal && !p.dataRetorno && !soLeitura)
        botao = `<button type="button" class="btn-txt kb-btn" data-kb="desfazer" data-rec="${p.recno}" ${ocupado ? 'disabled' : ''}>Desfazer</button>`;
    } else {
      if (onde === '' && p.previsaoSaida) {
        const d = dias(dt(p.previsaoSaida) as Date, this.hoje);
        linha = d > 0 ? `<span class="kb-st crit">Programado ${fmtCurto(p.previsaoSaida)} · há ${d} d</span>` : `<span class="m">Programado ${fmt(p.previsaoSaida)}</span>`;
      } else if (onde === '-') linha = `<span class="m">Emitido ${fmtCurto(p.emissao)}${p.dataFaturamento ? ` · NF ${fmtCurto(p.dataFaturamento)}` : ''}</span>`;
      if (onde !== '-' && (onde === '' ? p.previsaoSaida < hj : onde <= hj))
        botao = `<button type="button" class="btn pri kb-btn" data-kb="saiu" data-rec="${p.recno}" ${ocupado || soLeitura ? 'disabled' : ''} title="Grava a data de envio de hoje">${ocupado ? 'Gravando…' : 'Saiu'}</button>`;
    }
    const nf1 = this.notasDe(p)[0];
    if (nf1 && onde !== 'ent') botao = `<button type="button" class="btn kb-btn" data-nf="danfe" data-nota="${esc(nf1.nota)}" data-serie="${esc(nf1.serie)}" data-pedido="${esc(p.pedido)}" title="Imprimir o DANFE da NF ${esc(nf1.nota)} (SPEDNFE)">DANFE</button>` + botao;
    const arrasta = !saiu && onde !== 'ent' && !soLeitura && !ocupado;
    const obs = p.obsEntrega ? `<span class="m kb-obs" title="${esc(p.obsEntrega)}">📝 ${esc(p.obsEntrega.length > 70 ? p.obsEntrega.slice(0, 70) + '…' : p.obsEntrega)}</span>` : '';
    return `<article class="cartao kb${saiu && onde !== 'ent' ? ' feito' : ''}${onde === 'ent' && r.et === 'ent' ? ' feito' : ''}" data-ped="${p.recno}" tabindex="0" ${arrasta ? `draggable="true" data-arrasta="${p.recno}"` : ''} style="--cor:${ET[r.et].cor}">
      <span class="l1"><b class="mono">${esc(p.pedido)}</b>${pills.join('')}</span>
      <span class="cli" title="${esc(p.nome)}">${esc(p.fantasia || p.nome || '(sem nome)')}</span>
      <span class="m">${esc([p.cidade, p.uf].filter(Boolean).join('/') || 'sem cidade')} · ${esc(this.transpNome(r))}</span>
      <span class="m">${n0(r.qtd)} un${p.volume ? ` · ${n0(p.volume)} vol` : ''}${p.pesoBruto ? ` · ${n0(p.pesoBruto)} kg` : ''}</span>
      ${obs}${linha}${botao ? `<span class="kb-acoes">${botao}</span>` : ''}
    </article>`;
  }

  // ---------- Entregas (kanban por previsao de entrega) ----------
  // Pedido do usuario (25/11/2026): "todos os pedidos enviados, separados por dia
  // de entrega, igual na programacao, so que na entrega". O dia e a previsao da
  // transportadora (C5_ZDTPREV). Em transito = etapa Enviado; os entregues hoje
  // ficam na coluna de hoje, marcados. Arrastar para outro dia muda a previsao;
  // "Entregue" grava a data de entrega de hoje (a nova data, na reentrega).
  private telaEntregas(): string {
    const hj = iso(this.hoje);
    const regs = this.base();
    const transito = regs.filter((r) => r.et === 'env');
    const dias0 = this.diasProgramacao();
    const fimFaixa = dias0[dias0.length - 1];
    const comFds = [...new Set(transito.map((r) => r.p.dataPrevisao).filter((d) => d && d > hj && d < fimFaixa && !dias0.includes(d)))];
    const dias = [...dias0, ...comFds].sort();
    const porPrev = (a: Reg, b: Reg) => a.p.dataPrevisao.localeCompare(b.p.dataPrevisao) || a.p.pedido.localeCompare(b.p.pedido);
    const atrasadas = transito.filter((r) => r.p.dataPrevisao && r.p.dataPrevisao < hj).sort(porPrev);
    const entreguesHoje = regs.filter((r) => r.et === 'ent' && r.entFinal === hj);
    const doDia = (d: string) => {
      const it = transito.filter((r) => r.p.dataPrevisao === d).sort((a, b) => a.p.pedido.localeCompare(b.p.pedido));
      // hoje: tambem o que foi entregue hoje (de qualquer previsao), no fim
      return d === hj ? [...it, ...entreguesHoje.sort((a, b) => a.p.pedido.localeCompare(b.p.pedido))] : it;
    };
    const depois = transito.filter((r) => r.p.dataPrevisao > fimFaixa).sort(porPrev);
    const semPrev = transito.filter((r) => !r.p.dataPrevisao).sort((a, b) => (a.p.dataEnvio || '').localeCompare(b.p.dataEnvio || '') || a.p.pedido.localeCompare(b.p.pedido));
    const hoje = doDia(hj);
    const emTransitoHoje = hoje.filter((r) => r.et === 'env').length;
    const podeMover = !this.faltando.has(CAMPO.dataPrevisao);
    const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
    const rotDia = (d: string) => (d === hj ? `Hoje · ${fmtCurto(d)}` : `${SEMANA[(dt(d) as Date).getDay()]} · ${fmtCurto(d)}`);
    const coluna = (id: string, dia: string, titulo: string, sub: string, cor: string, itens: Reg[], soltar: boolean) =>
      `<section class="quadro kb-col" ${id ? `id="${id}"` : ''} ${soltar && podeMover ? `data-dia-ent="${dia}"` : ''} style="--cor:${cor}" aria-label="${esc(titulo)}">
        <header><h2><span>${esc(titulo)}</span><span class="q num">${n0(itens.length)}</span></h2><p>${sub}</p></header>
        <div class="lista">${itens.map((r) => this.cartaoEnt(r, dia, podeMover)).join('') || `<p class="muted vazio">${soltar && podeMover ? 'Arraste pedidos para cá.' : 'Nenhum pedido.'}</p>`}</div>
      </section>`;
    const kpi = (r: string, v: string, s: string, crit: boolean, alvo: string) =>
      `<button type="button" class="kpi${crit ? ' crit' : ''}" data-acao="ir" data-alvo="${alvo}"><div class="r">${r}</div><div class="v">${v}</div><div class="s">${s} · clique para ver</div></button>`;
    const cols = [
      coluna('ent-atr', '', 'Atrasadas', 'previsão da transportadora já passou e sem entrega', '#b3261e', atrasadas, false),
      ...dias.map((d) => {
        const it = doDia(d);
        const ent = it.filter((r) => r.et === 'ent').length;
        return coluna(
          d === hj ? 'ent-hoje' : '',
          d,
          rotDia(d),
          d === hj ? `${n0(ent)} entregues · ${n0(it.length - ent)} em trânsito` : `${n0(it.length)} previstas · ${n0(it.reduce((s, r) => s + r.qtd, 0))} un`,
          d === hj ? '#0b6e99' : '#5b8db8',
          it,
          true,
        );
      }),
      coluna('', '', 'Depois', `previsão depois de ${fmtCurto(fimFaixa)}`, '#8a94a0', depois, false),
      coluna('ent-sem', '', 'Sem previsão', 'enviados sem a data da transportadora · arraste para um dia', '#c8a400', semPrev, false),
    ].join('');
    return `${podeMover ? '' : '<p class="aviso">O campo da previsão de entrega (C5_ZDTPREV) não existe neste ambiente: a aba fica só para consulta.</p>'}
      <div class="resumo">
        ${kpi('Previstas para hoje', n0(hoje.length), `${n0(hoje.length - emTransitoHoje)} entregues · ${n0(emTransitoHoje)} em trânsito`, false, 'ent-hoje')}
        ${kpi('Atrasadas', n0(atrasadas.length), 'previsão passou e sem entrega', atrasadas.length > 0, 'ent-atr')}
        ${kpi('Em trânsito', n0(transito.length), `${n0(transito.reduce((s, r) => s + r.qtd, 0))} un enviadas e sem entrega`, false, 'ent-hoje')}
        ${kpi('Sem previsão', n0(semPrev.length), 'enviados sem a data da transportadora', semPrev.length > 0, 'ent-sem')}
      </div>
      <section class="painel">
        <header><h2>Entregas por dia</h2><p>Pedidos enviados e ainda sem entrega, no dia da previsão da transportadora (C5_ZDTPREV). Arraste o cartão para outro dia para mudar a previsão. "Entregue" grava a data de entrega de hoje (a nova data, quando houve reentrega). Os entregues hoje aparecem marcados na coluna de hoje. Clique no cartão para abrir o pedido.</p></header>
        <div class="kb-quadro">${cols}</div>
      </section>`;
  }

  /** Cartao da aba Entregas. dia = data da coluna ('' = atrasadas, depois ou sem previsao) */
  private cartaoEnt(r: Reg, dia: string, podeMover: boolean): string {
    const p = r.p;
    const hj = iso(this.hoje);
    const ocupado = this.ocupados.has(p.recno);
    const entregue = r.et === 'ent';
    const pills: string[] = [];
    if (!entregue && r.prazo && r.prazo !== 'noprazo') pills.push(this.pillPrazo(r, true));
    if (p.reentrega === 'SIM') pills.push('<span class="pill reent">Reentrega</span>');
    if (p.indicador) pills.push(`<span class="pill semprev">${esc(this.txtOp('indicador', p.indicador))}</span>`);
    let linha = '';
    let botao = '';
    if (entregue) {
      linha = `<span class="kb-st ok">✓ Entregue ${fmtCurto(r.entFinal)}${p.dataPrevisao && p.dataPrevisao !== r.entFinal ? ` <span class="muted">(previsão ${fmtCurto(p.dataPrevisao)})</span>` : ''}</span>`;
      botao = `<button type="button" class="btn-txt kb-btn" data-kb="desfazer-ent" data-rec="${p.recno}" ${ocupado ? 'disabled' : ''}>Desfazer</button>`;
    } else {
      const d = p.dataPrevisao ? dias(dt(p.dataPrevisao) as Date, this.hoje) : 0;
      linha =
        dia === '' && p.dataPrevisao && d > 0
          ? `<span class="kb-st crit">Previsão ${fmtCurto(p.dataPrevisao)} · há ${d} d</span>`
          : `<span class="m">Enviado ${fmtCurto(p.dataEnvio)}${p.dataPrevisao && dia === '' ? ` · previsão ${fmt(p.dataPrevisao)}` : ''}${this.cteTxt(r)}</span>`;
      botao = `<button type="button" class="btn pri kb-btn" data-kb="entregue" data-rec="${p.recno}" ${ocupado ? 'disabled' : ''} title="Grava a data de entrega de hoje">${ocupado ? 'Gravando…' : 'Entregue'}</button>`;
    }
    const arrasta = !entregue && podeMover && !ocupado;
    const obs = p.obsEntrega ? `<span class="m kb-obs" title="${esc(p.obsEntrega)}">📝 ${esc(p.obsEntrega.length > 70 ? p.obsEntrega.slice(0, 70) + '…' : p.obsEntrega)}</span>` : '';
    return `<article class="cartao kb${entregue ? ' feito' : ''}" data-ped="${p.recno}" tabindex="0" ${arrasta ? `draggable="true" data-arrasta-ent="${p.recno}"` : ''} style="--cor:${ET[r.et].cor}">
      <span class="l1"><b class="mono">${esc(p.pedido)}</b>${pills.join('')}</span>
      <span class="cli" title="${esc(p.nome)}">${esc(p.fantasia || p.nome || '(sem nome)')}</span>
      <span class="m">${esc([p.cidade, p.uf].filter(Boolean).join('/') || 'sem cidade')} · ${esc(this.transpNome(r))}</span>
      <span class="m">${n0(r.qtd)} un${p.volume ? ` · ${n0(p.volume)} vol` : ''}${(p.notas || []).length ? ` · NF ${esc((p.notas || []).join(', '))}` : ''}</span>
      ${obs}${linha}${botao ? `<span class="kb-acoes">${botao}</span>` : ''}
    </article>`;
  }

  /** Aba Entregas: arrastou para um dia -> nova previsao de entrega */
  private async prever(recno: number, dia: string): Promise<void> {
    const r = this.reg(recno);
    if (!r || !dia || r.p.dataPrevisao === dia || r.et !== 'env') return;
    if (r.p.dataEnvio && dia < r.p.dataEnvio) {
      this.aviso(`A previsão (${fmt(dia)}) não pode ser antes do envio (${fmt(r.p.dataEnvio)}).`, true);
      return;
    }
    await this.gravarRapido(r, { dataPrevisao: dia }, `Pedido ${r.p.pedido}: previsão de entrega para ${fmt(dia)}.`);
  }

  private async acaoKanban(acao: string, recno: number): Promise<void> {
    const hj = iso(this.hoje);
    if (acao === 'mais') {
      this.limSemProg += LIMITE_CARTOES;
      this.desenhar();
      return;
    }
    const r = this.reg(recno);
    if (!r) return;
    const reent = r.p.reentrega === 'SIM' && !this.faltando.has(CAMPO.dataNovaEntrega);
    if (acao === 'saiu') await this.gravarRapido(r, { dataEnvio: hj }, `Pedido ${r.p.pedido}: saída registrada hoje.`);
    else if (acao === 'desfazer') await this.gravarRapido(r, { dataEnvio: '' }, `Pedido ${r.p.pedido}: saída desfeita.`);
    else if (acao === 'entregue') await this.gravarRapido(r, reent ? { dataNovaEntrega: hj } : { dataEntrega: hj }, `Pedido ${r.p.pedido}: entrega registrada hoje.`);
    // aba Entregas: desfaz so a entrega gravada hoje
    else if (acao === 'desfazer-ent' && r.entFinal === hj) await this.gravarRapido(r, reent ? { dataNovaEntrega: '' } : { dataEntrega: '' }, `Pedido ${r.p.pedido}: entrega desfeita.`);
  }

  private async programar(recno: number, dia: string): Promise<void> {
    const r = this.reg(recno);
    if (!r || r.p.previsaoSaida === dia || r.p.dataEnvio) return;
    await this.gravarRapido(r, { previsaoSaida: dia }, dia ? `Pedido ${r.p.pedido} programado para ${fmt(dia)}.` : `Pedido ${r.p.pedido} sem programação.`);
  }

  /** Notas do pedido (numero, serie, data), sem repetir */
  private notasDe(p: Pedido): { nota: string; serie: string; data: string }[] {
    const vistas = new Map<string, { nota: string; serie: string; data: string }>();
    (p.itens || []).forEach((i) => {
      if (i.nota && !vistas.has(i.nota + '|' + i.serie)) vistas.set(i.nota + '|' + i.serie, { nota: i.nota, serie: i.serie || '', data: i.dataFat || '' });
    });
    return [...vistas.values()];
  }

  /**
   * Numeros de serie da Z01 na linha do produto (pedido do usuario, 16/11/2026, como no RX Pedidos).
   * Mostra a NF da serie so quando ela difere da NF do item. Sem serie: nada.
   */
  private seriesItem(i: ItemPedido): string {
    const sr = i.numerosSerie || [];
    if (!sr.length) return '';
    return `<span class="series-rot">Nº de série · ${n0(sr.length)} de ${n0(i.quantidade)} un</span><ul class="series-linha">${sr
      .map(([s, nf]) => `<li title="${nf ? 'NF ' + esc(nf) : 'sem NF ainda'}"><b>${esc(s)}</b>${nf && nf !== i.nota ? ` <span class="muted">NF ${esc(nf)}</span>` : !nf && i.nota ? ' <span class="muted">sem NF</span>' : ''}</li>`)
      .join('')}</ul>`;
  }

  /** Gaveta: cada NF do pedido com o DANFE (pedido do usuario, 15/11/2026; a carta de correcao saiu em 16/11) */
  private barraNotas(p: Pedido): string {
    const notas = this.notasDe(p);
    if (!notas.length) return '';
    const fora = !this.api.nota;
    return `<div class="nf-barra">${notas
      .map((n) => {
        const attrs = `data-nota="${esc(n.nota)}" data-serie="${esc(n.serie)}" data-pedido="${esc(p.pedido)}" ${fora ? 'disabled title="Só com a tela aberta pelo Protheus"' : ''}`;
        return `<div class="nf-item">
          <span class="nf-id"><b>NF ${esc(n.nota)}</b>${n.serie ? ` · série ${esc(n.serie)}` : ''}${n.data ? ` · ${fmt(n.data)}` : ''}</span>
          <span class="nf-bts"><button type="button" class="btn pri" data-nf="danfe" ${attrs}>Imprimir DANFE</button></span>
        </div>`;
      })
      .join('')}${fora ? '<p class="nota">O DANFE abre a rotina da SPEDNFE e só funciona com a tela aberta pelo menu do Protheus.</p>' : ''}</div>`;
  }

  private acaoNota(acao: AcaoNf, nota: string, serie: string, pedido: string): void {
    if (!this.api.nota) {
      this.aviso('O DANFE só funciona com a tela aberta pelo menu do Protheus.', true);
      return;
    }
    const ok = this.api.nota(acao, { nota, serie, pedido });
    if (!ok) this.aviso('Não foi possível falar com o Protheus para abrir a rotina. Feche a tela e abra de novo pelo menu.', true);
    else this.aviso(`Abrindo o DANFE da NF ${nota} no Protheus…`);
  }

  /** Grava um campo pela programacao (mesmo PUT da gaveta) e atualiza o cartao */
  private async gravarRapido(r: Reg, dados: PedidoEdicao, ok: string): Promise<void> {
    if (this.ocupados.has(r.p.recno)) return;
    this.ocupados.add(r.p.recno);
    this.desenhar();
    try {
      const novo = await this.api.salvar(r.p.recno, dados);
      if (novo && novo.pedido) {
        const i = this.regs.findIndex((x) => x.p.recno === r.p.recno);
        if (i >= 0) this.regs[i] = this.montar(novo);
      }
      this.aviso(ok);
    } catch (e) {
      this.aviso(`Não foi possível gravar o pedido ${r.p.pedido}: ${this.api.mensagemErro(e)}`, true);
    } finally {
      this.ocupados.delete(r.p.recno);
      this.desenhar();
    }
  }

  // ---------- Lista ----------
  private colunasLista(): { k: string; t: string; v: (r: Reg, i: ItemPedido) => string | number; f?: (v: string | number) => string; dir?: boolean; tit?: string }[] {
    const d = (v: string | number) => fmt(String(v));
    const m = (v: string | number) => (v ? rs(Number(v)) : '');
    return [
      { k: 'ped', t: 'Pedido', v: (r) => r.p.pedido },
      { k: 'et', t: 'Quadro', v: (r) => ET[r.et].curto },
      { k: 'sit', t: 'Situação', v: (r) => (r.prazo === 'atrasado' && r.atraso !== null ? `Atrasado ${r.atraso} d` : PRAZO_TXT[r.prazo]) },
      { k: 'pend', t: 'Informação faltando', v: (r) => r.pend.map((k) => PEND_TXT[k][1]).join(', '), tit: 'O que falta preencher no pedido (mesmo filtro dos quadros)' },
      { k: 'emi', t: 'Emissão', v: (r) => r.p.emissao, f: d },
      { k: 'cli', t: 'Cliente', v: (r) => r.p.cliente },
      { k: 'loja', t: 'Loja', v: (r) => r.p.loja },
      { k: 'nome', t: 'Nome', v: (r) => r.p.nome },
      { k: 'cid', t: 'Cidade (entrega)', v: (r) => r.p.cidade },
      { k: 'uf', t: 'UF', v: (r) => r.p.uf },
      { k: 'tel', t: 'Telefone (entrega)', v: (r) => r.p.telefone || '', tit: 'A1_DDD + A1_TEL do cliente de entrega' },
      { k: 'grp', t: 'Grupo do cliente', v: (r) => r.p.grupo },
      { k: 'vend', t: 'Vendedor', v: (r) => r.p.vendedor },
      { k: 'tipo', t: 'Tipo do pedido', v: (r) => this.txtOp('tipoPedido', r.p.tipoPedido) },
      { k: 'desc', t: 'Produto', v: (_, i) => i.descricao },
      { k: 'qtd', t: 'Quantidade', v: (_, i) => i.quantidade, f: (v) => n0(Number(v)), dir: true },
      { k: 'val', t: 'Valor total', v: (_, i) => i.valor, f: m, dir: true },
      { k: 'tes', t: 'TES', v: (_, i) => `${i.tes}${i.descTes ? ' - ' + i.descTes : ''}` },
      { k: 'nf', t: 'NF', v: (_, i) => i.nota },
      { k: 'dfat', t: 'Faturamento', v: (_, i) => i.dataFat, f: d },
      { k: 'transp', t: 'Transportadora', v: (r) => (r.p.transportadora ? `${r.p.transportadora} - ${r.p.transportadoraNome}` : '') },
      { k: 'tpfrete', t: 'Tipo do frete', v: (r) => this.txtOp('tipoFrete', r.p.tipoFrete || ''), tit: 'C5_TPFRETE' },
      { k: 'frete', t: 'Frete destacado', v: (r) => r.p.frete, f: m, dir: true, tit: 'C5_FRETE (do pedido, repete em cada item)' },
      { k: 'vol', t: 'Volume', v: (r) => r.p.volume, f: (v) => (v ? n0(Number(v)) : ''), dir: true },
      { k: 'esp', t: 'Espécie', v: (r) => r.p.especie || '', tit: 'C5_ESPECI1 (do pedido, repete em cada item)' },
      { k: 'pliq', t: 'Peso líquido', v: (r) => r.p.pesoLiquido || 0, f: (v) => pesoTxt(Number(v)), dir: true, tit: 'C5_PESOL (do pedido, repete em cada item)' },
      { k: 'obs', t: 'Observações da entrega', v: (r) => r.p.obsEntrega || '', tit: 'C5_ZOBS' },
      { k: 'pbru', t: 'Peso bruto', v: (r) => r.p.pesoBruto || 0, f: (v) => pesoTxt(Number(v)), dir: true, tit: 'C5_PBRUTO (do pedido, repete em cada item)' },
      { k: 'fnd', t: 'Frete não destacado', v: (r) => r.p.freteNaoDestacado, f: m, dir: true, tit: 'C5_ZFRETE (do pedido, repete em cada item)' },
      // pedido faturado em partes: o envio da NF do item (25/11/2026)
      { k: 'tpmat', t: 'Tipo de material', v: (r, i) => this.txtOp('tipoMaterial', this.envioDoItem(r, i)?.tipoMaterial ?? r.p.tipoMaterial) },
      { k: 'denv', t: 'Envio', v: (r, i) => this.envioDoItem(r, i)?.dataEnvio ?? r.p.dataEnvio, f: d },
      { k: 'dprev', t: 'Previsão entrega', v: (r, i) => this.envioDoItem(r, i)?.dataPrevisao ?? r.p.dataPrevisao, f: d },
      { k: 'dent', t: 'Entrega', v: (r, i) => { const e = this.envioDoItem(r, i); return e && e.idx > 0 ? e.entFinal : r.p.dataEntrega; }, f: d },
      ...(this.temCustos
        ? [
            { k: 'cte', t: 'CTEs', v: (r: Reg) => r.ctes.join(' / '), tit: 'Todos os CTEs/documentos das cobranças de frete do pedido' },
            { k: 'vcte', t: 'Custo de frete', v: (r: Reg) => r.custo, f: m, dir: true, tit: 'Soma das cobranças (CTE, reentregas e taxas)' },
            { k: 'ncus', t: 'Cobranças', v: (r: Reg) => (r.p.custos || []).length || '', dir: true },
            { k: 'scus', t: 'Custo em divergência', v: (r: Reg) => (r.nDiv ? `${r.nDiv} em aberto` : '') },
            { k: 'reent', t: 'Reentrega', v: (r: Reg) => r.p.reentrega },
          ]
        : [
            { k: 'cte', t: 'CTE', v: (r: Reg) => r.p.cte },
            { k: 'vcte', t: 'Valor CTE', v: (r: Reg) => r.p.valorCte, f: m, dir: true },
            { k: 'reent', t: 'Reentrega', v: (r: Reg) => r.p.reentrega },
            { k: 'ctere', t: 'CTE reentrega', v: (r: Reg) => r.p.cteReentrega },
            { k: 'vctere', t: 'Valor CTE reentrega', v: (r: Reg) => r.p.valorCteReentrega, f: m, dir: true },
          ]),
      { k: 'dnova', t: 'Nova entrega', v: (r) => r.p.dataNovaEntrega, f: d },
      { k: 'ind', t: 'Indicador de atraso', v: (r) => this.txtOp('indicador', r.p.indicador) },
      { k: 'dret', t: 'Retorno', v: (r) => r.p.dataRetorno || '', f: d },
      { k: 'motret', t: 'Motivo do retorno', v: (r) => this.txtOp('motivoRetorno', r.p.motivoRetorno || '') },
      { k: 'pedren', t: 'Pedido do reenvio', v: (r) => r.p.pedidoReenvio || '' },
      { k: 'fin', t: 'Finalizado sem entrega', v: (r) => (r.p.finalizado === 'S' ? this.txtOp('motivoFinal', r.p.motivoFinal || '') || 'Sim' : ''), tit: 'Extravio, enviado em outro pedido ou outro motivo (ZLH)' },
      { k: 'dfin', t: 'Data da finalização', v: (r) => (r.p.finalizado === 'S' ? r.p.dataFinal || '' : ''), f: d },
      { k: 'pedfin', t: 'Enviado no pedido', v: (r) => (r.p.finalizado === 'S' ? r.p.pedidoFinal || '' : '') },
      { k: 'reemb', t: 'Reembolso', v: (r) => (r.p.finalizado === 'S' && r.p.motivoFinal === 'E' ? this.txtOp('reembolso', r.p.reembolso || '') || 'Pendente' : '') },
      { k: 'vreemb', t: 'Valor do reembolso', v: (r) => (r.p.finalizado === 'S' ? r.p.valorReembolso || 0 : 0), f: m, dir: true },
      { k: 'obsind', t: 'Indicador: o que aconteceu', v: (r) => r.p.obsIndicador || '', tit: 'Descrição do indicador "Outros" (ZLH)' },
    ];
  }

  private linhasLista(): { r: Reg; i: ItemPedido }[] {
    const out: { r: Reg; i: ItemPedido }[] = [];
    this.base().forEach((r) => (r.p.itens || []).forEach((i) => out.push({ r, i })));
    const { k, asc } = this.e.ord;
    if (k) {
      const c = this.colunasLista().find((x) => x.k === k);
      if (c) {
        out.sort((a, b) => {
          const va = c.v(a.r, a.i);
          const vb = c.v(b.r, b.i);
          const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR', { numeric: true });
          return asc ? cmp : -cmp;
        });
      }
    }
    return out;
  }

  private telaLista(): string {
    const cols = this.colunasLista();
    const linhas = this.linhasLista();
    const { k, asc } = this.e.ord;
    const cab = cols.map((c) => `<th data-ord="${c.k}" class="${c.dir ? 'dir ' : ''}${k === c.k ? 'ord' + (asc ? ' asc' : '') : ''}" ${c.tit ? `title="${esc(c.tit)}"` : ''}>${esc(c.t)}</th>`).join('');
    const corpo = linhas
      .slice(0, this.e.limite)
      .map(({ r, i }) => {
        const tds = cols
          .map((c) => {
            const v = c.v(r, i);
            const txt = c.f ? c.f(v) : String(v ?? '');
            if (c.k === 'sit') return `<td>${this.pillPrazo(r, true)}</td>`;
            if (c.k === 'ped') return `<td class="mono">${esc(txt)}</td>`;
            return `<td class="${c.dir ? 'dir num' : ''}">${esc(txt)}</td>`;
          })
          .join('');
        return `<tr data-ped="${r.p.recno}">${tds}</tr>`;
      })
      .join('');
    const pedidos = new Set(linhas.map((x) => x.r.p.recno)).size;
    const mais = linhas.length > this.e.limite ? `<div class="mais"><button class="btn" data-acao="mais-lista">Mostrar mais (${n0(linhas.length - this.e.limite)} restantes)</button></div>` : '';
    return `<section class="painel">
      <header><h2>Lista completa</h2><p>${n0(linhas.length)} itens de ${n0(pedidos)} pedidos · um item por linha; frete, volume e CTE são do pedido e repetem em cada item. Clique na linha para abrir e editar o pedido.</p>
        <span class="total-hd"><button class="btn" data-acao="exportar">Exportar planilha (CSV)</button></span></header>
      <div class="tabela-wrap registros"><table><thead><tr>${cab}</tr></thead><tbody>${corpo || `<tr class="sem-clique"><td colspan="${cols.length}" class="muted">Nenhum pedido com esses filtros.</td></tr>`}</tbody></table></div>
      ${mais}
    </section>`;
  }

  private exportar(): void {
    const cols = this.colunasLista();
    const linhas = this.linhasLista();
    const cel = (v: string | number) => {
      const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '');
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const dataBR = (s: string) => fmt(s);
    const datas = new Set(['emi', 'dfat', 'denv', 'dprev', 'dent', 'dnova', 'dret', 'dfin']);
    const txt =
      '﻿' +
      [cols.map((c) => cel(c.t)).join(';'), ...linhas.map(({ r, i }) => cols.map((c) => cel(c.k === 'sit' ? (c.v(r, i) as string) : datas.has(c.k) ? dataBR(String(c.v(r, i))) : c.v(r, i))).join(';'))].join('\r\n');
    try {
      const url = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `logistica-pedidos-${iso(this.hoje)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      this.aviso(`Planilha gerada com ${n0(linhas.length)} linhas.`);
    } catch (e) {
      this.aviso(`Não foi possível gerar a planilha: ${e}`, true);
    }
  }

  // ---------- Indicadores ----------
  private telaIndicadores(): string {
    // pedido faturado em partes conta cada envio (NF) separado (25/11/2026)
    const regs = this.porEnvio(this.base());
    const enviados = regs.filter((r) => r.p.dataEnvio);
    const entregues = regs.filter((r) => r.et === 'ent');
    const noPrazo = entregues.filter((r) => r.prazo === 'noprazo');
    const atrEnt = entregues.filter((r) => r.prazo === 'atrasado');
    const atrTrans = regs.filter((r) => r.et === 'env' && r.prazo === 'atrasado');
    const comPrev = noPrazo.length + atrEnt.length;
    const lead = entregues.map((r) => dias(dt(r.p.dataEnvio) as Date, dt(r.entFinal) as Date)).filter((x) => x >= 0);
    const media = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);
    const custo = enviados.reduce((s, r) => s + r.custo, 0);
    const cobrado = enviados.reduce((s, r) => s + r.cobrado, 0);
    const reent = enviados.filter((r) => r.p.reentrega === 'SIM').length;
    const comCte = enviados.filter((r) => r.custo > 0);
    const kpi = (r: string, v: string, s: string, cls = '') => `<div class="kpi ${cls}"><div class="r">${r}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
    const kpis = `<div class="resumo">
      ${kpi('Enviados', n0(enviados.length), `${n0(enviados.reduce((s, r) => s + r.qtd, 0))} un · pela data de envio`)}
      ${kpi('Entregues no prazo', pct(noPrazo.length, comPrev), `${n0(noPrazo.length)} de ${n0(comPrev)} com previsão${entregues.length - comPrev ? ` · ${n0(entregues.length - comPrev)} sem previsão` : ''}`)}
      ${kpi('Entregues com atraso', n0(atrEnt.length), atrEnt.length ? `atraso médio ${n0(Math.round(media(atrEnt.map((r) => r.atraso || 0)) * 10) / 10)} d` : 'pela data da transportadora', atrEnt.length ? 'crit' : '')}
      ${kpi('Em trânsito atrasados', n0(atrTrans.length), 'passaram da previsão', atrTrans.length ? 'crit' : '')}
      ${kpi('Tempo médio de entrega', lead.length ? `${n0(Math.round(media(lead) * 10) / 10)} d` : '–', 'do envio à entrega')}
      ${kpi('Reentregas', n0(reent), pct(reent, enviados.length) + ' dos enviados')}
      ${kpi(this.temCustos ? 'Custo de frete' : 'Custo de CTE', rs0(custo), `${n0(comCte.length)} pedidos com ${this.temCustos ? 'custo' : 'CTE'} lançado`)}
      ${this.temCustos ? kpi('Custo em divergência', n0(enviados.filter((r) => r.nDiv > 0).length), 'pedidos com cobrança divergente ou em contato', enviados.some((r) => r.nDiv > 0) ? 'crit' : '') : ''}
      ${kpi('Frete cobrado', rs0(cobrado), 'destacado + não destacado')}
    </div>`;

    // Pontualidade por mes da entrega
    const mesesEnt = [...new Set(entregues.map((r) => r.entFinal.slice(0, 7)))].sort();
    const serPrazo: G.Serie[] = [
      { nome: 'No prazo', cor: COR_OK, v: mesesEnt.map((m) => entregues.filter((r) => r.entFinal.startsWith(m) && r.prazo === 'noprazo').length) },
      { nome: 'Atrasado', cor: COR_ATR, v: mesesEnt.map((m) => entregues.filter((r) => r.entFinal.startsWith(m) && r.prazo === 'atrasado').length) },
      { nome: 'Sem previsão', cor: COR_NEUTRA, v: mesesEnt.map((m) => entregues.filter((r) => r.entFinal.startsWith(m) && r.prazo === 'semprev').length) },
    ];
    const gPrazo = mesesEnt.length ? G.colunas(mesesEnt.map(rotMes), serPrazo, true, (v) => `${n0(v)} ped.`, 1000) : '<p class="muted">Nenhuma entrega registrada.</p>';

    // Motivos dos atrasos (entregues atrasados + em transito atrasados)
    const atrasados = [...atrEnt, ...atrTrans];
    const motivos = new Map<string, number>();
    atrasados.forEach((r) => {
      const k = r.p.indicador ? this.txtOp('indicador', r.p.indicador) : 'Não informado';
      motivos.set(k, (motivos.get(k) || 0) + 1);
    });
    const gMotivos = G.barras(
      [...motivos.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ rot: k, v, cor: k === 'Não informado' ? COR_NEUTRA : G.CAT[1], sub: pct(v, atrasados.length) })),
      (v) => `${n0(v)} ped.`,
    );

    // Por estado
    const porUf = new Map<string, { n: number; q: number }>();
    enviados.forEach((r) => {
      const k = r.p.uf || '(sem UF)';
      const g = porUf.get(k) || { n: 0, q: 0 };
      g.n++;
      g.q += r.qtd;
      porUf.set(k, g);
    });
    const gUf = G.barras(
      [...porUf.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, g]) => ({ rot: k, v: g.n, cor: G.CAT[0], tip: `${k}: ${n0(g.n)} pedidos · ${n0(g.q)} un` })),
      (v) => n0(v),
    );

    // Modelos mais enviados (unidades) e tipo de material
    const porModelo = new Map<string, number>();
    enviados.forEach((r) => (r.p.itens || []).forEach((i) => porModelo.set(i.descricao || i.produto, (porModelo.get(i.descricao || i.produto) || 0) + (i.quantidade || 0))));
    const gModelos = G.barras(
      [...porModelo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => ({ rot: k, v, cor: G.CAT[2] })),
      (v) => `${n0(v)} un`,
    );
    const porMat = new Map<string, number>();
    enviados.forEach((r) => {
      const k = r.p.tipoMaterial ? this.txtOp('tipoMaterial', r.p.tipoMaterial) : 'Não informado';
      porMat.set(k, (porMat.get(k) || 0) + 1);
    });
    const gMat = G.rosca([...porMat.entries()].map(([rot, v]) => ({ rot, v, cor: rot === 'Não informado' ? COR_NEUTRA : undefined })), (v) => `${n0(v)} ped.`);

    // Custo CTE x cobrado por mes do envio (so pedidos com CTE lancado)
    const mesesEnv = [...new Set(enviados.map((r) => r.p.dataEnvio.slice(0, 7)))].sort();
    const gCusto = comCte.length
      ? G.colunas(
          mesesEnv.map(rotMes),
          [
            { nome: 'Frete cobrado no pedido', cor: G.CAT[0], v: mesesEnv.map((m) => comCte.filter((r) => r.p.dataEnvio.startsWith(m)).reduce((s, r) => s + r.cobrado, 0)) },
            { nome: 'Custo do CTE', cor: G.CAT[1], v: mesesEnv.map((m) => comCte.filter((r) => r.p.dataEnvio.startsWith(m)).reduce((s, r) => s + r.custo, 0)) },
          ],
          false,
          rs0,
          1400,
        )
      : '<p class="muted">Nenhum pedido enviado com valor de CTE lançado.</p>';
    const piores = comCte
      .map((r) => ({ r, dif: r.cobrado - r.custo }))
      .filter((x) => x.dif < 0)
      .sort((a, b) => a.dif - b.dif)
      .slice(0, 20);
    const tabPiores = piores.length
      ? `<div class="tabela-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Transportadora</th><th>Envio</th><th class="dir">Cobrado</th><th class="dir">CTE</th><th class="dir">Diferença</th></tr></thead><tbody>${piores
          .map(
            ({ r, dif }) =>
              `<tr data-ped="${r.p.recno}"><td class="mono">${esc(r.p.pedido)}</td><td>${esc(r.p.fantasia || r.p.nome)}</td><td>${esc(this.transpNome(r))}</td><td>${fmt(r.p.dataEnvio)}</td><td class="dir num">${rs(r.cobrado)}</td><td class="dir num">${rs(r.custo)}</td><td class="dir num crit-txt">${rs(dif)}</td></tr>`,
          )
          .join('')}</tbody></table></div>`
      : '<p class="muted">Nenhum pedido com CTE acima do frete cobrado.</p>';

    const cartao = (t: string, s: string, corpo: string, cls = '') => `<section class="painel ${cls}"><header><h2>${t}</h2><p>${s}</p></header><div class="corpo">${corpo}</div></section>`;
    return `${kpis}
      <div class="graficos">
        ${cartao('Entregas no prazo × atrasadas', 'Pedidos pelo mês da entrega, contra a previsão da transportadora (C5_ZDTPREV)', gPrazo, 'duplo')}
        ${cartao('Motivos dos atrasos', `${n0(atrasados.length)} pedidos atrasados (entregues e em trânsito), pelo indicador de atraso`, gMotivos)}
        ${cartao('Comparação entre transportadoras', 'Escolha o que comparar. Pedidos enviados no recorte; % no prazo e atraso pela previsão da transportadora.', this.comparaTransp(enviados), 'largo')}
        ${cartao('Ranking de transportadoras', 'Pedidos enviados no recorte. Clique no título da coluna para ordenar.', this.rankingTransp(enviados), 'largo')}
        ${cartao('Frete acumulado por transportadora', `Pelo mês do envio. Custo = ${this.temCustos ? 'todas as cobranças de frete (CTE, reentregas e taxas)' : 'CTE + CTE de reentrega'}; cobrado = frete destacado + não destacado.`, this.acumulado(enviados), 'largo')}
        ${cartao('Custo do CTE × frete cobrado no pedido', `Por mês do envio, só os ${n0(comCte.length)} pedidos com CTE lançado. Cobrado ${rs0(comCte.reduce((s, r) => s + r.cobrado, 0))} × CTE ${rs0(comCte.reduce((s, r) => s + r.custo, 0))}.`, gCusto, 'largo')}
        ${cartao('Pedidos com CTE acima do cobrado', 'Os 20 com maior diferença. Clique para abrir o pedido.', tabPiores, 'largo')}
        ${cartao('Modelos mais enviados', 'Unidades dos 15 produtos com mais envios (C6_DESCRI)', gModelos)}
        ${cartao('Envios por tipo de material', 'Pedidos enviados por C5_ZTPMAT', gMat)}
        ${cartao('Envios por estado', 'Pedidos enviados pela UF do cliente de entrega', `<div class="rolavel">${gUf}</div>`)}
      </div>`;
  }

  /** Grafico de comparacao entre transportadoras pela medida escolhida (COMPARA) */
  private comparaTransp(enviados: Reg[]): string {
    const m = this.porTransp(enviados);
    if (!m.size) return '<p class="muted">Nenhum pedido enviado no recorte.</p>';
    const c = COMPARA.find((x) => x[0] === this.e.compara) || COMPARA[0];
    const [, , val, fmtV, sub, cor, escala] = c;
    const itens = [...m.values()]
      .map((g) => ({ g, v: val(g) }))
      .filter((x) => x.v !== null)
      .sort((a, b) => (b.v as number) - (a.v as number))
      .map(({ g, v }) => ({ rot: g.nome, v: v as number, cor, sub: sub(g) }));
    const seg = `<div class="seg" role="group" aria-label="Comparar por">${COMPARA.map(([k, t]) => `<button type="button" data-compara="${k}" aria-pressed="${c[0] === k}">${t}</button>`).join('')}</div>`;
    const sem = m.size - itens.length;
    return `<div class="pilha-h">${seg}</div><div class="compara">${G.barras(itens, fmtV, escala)}</div>${sem ? `<p class="nota">${n0(sem)} transportadora${sem > 1 ? 's' : ''} sem dado para esta medida (ex.: nenhuma entrega com previsão).</p>` : ''}`;
  }

  /** Agregado por transportadora dos pedidos enviados (ranking e comparacao) */
  private porTransp(enviados: Reg[]): Map<string, LnTransp> {
    const m = new Map<string, LnTransp>();
    enviados.forEach((r) => {
      const k = r.p.transportadora || '-';
      const g = m.get(k) || { div: 0, nome: this.transpNome(r), env: 0, ent: 0, noPrazo: 0, atr: 0, comPrev: 0, atrDias: 0, lead: 0, nLead: 0, custo: 0, nCte: 0, cobrado: 0, reent: 0, qtd: 0 };
      g.env++;
      g.qtd += r.qtd;
      g.custo += r.custo;
      if (r.custo > 0) g.nCte++;
      g.cobrado += r.cobrado;
      if (r.p.reentrega === 'SIM') g.reent++;
      if (r.nDiv > 0) g.div++;
      if (r.et === 'ent') {
        g.ent++;
        if (r.prazo === 'noprazo') g.noPrazo++;
        if (r.prazo === 'atrasado') {
          g.atr++;
          g.atrDias += r.atraso || 0;
        }
        if (r.prazo === 'noprazo' || r.prazo === 'atrasado') g.comPrev++;
        const l = dias(dt(r.p.dataEnvio) as Date, dt(r.entFinal) as Date);
        if (l >= 0) {
          g.lead += l;
          g.nLead++;
        }
      }
      m.set(k, g);
    });
    return m;
  }

  private rankingTransp(enviados: Reg[]): string {
    type Ln = LnTransp;
    const m = this.porTransp(enviados);
    if (!m.size) return '<p class="muted">Nenhum pedido enviado no recorte.</p>';
    const cols: { k: string; t: string; v: (g: Ln) => number; f: (g: Ln) => string }[] = [
      { k: 'env', t: 'Envios', v: (g) => g.env, f: (g) => n0(g.env) },
      { k: 'qtd', t: 'Unidades', v: (g) => g.qtd, f: (g) => n0(g.qtd) },
      { k: 'ent', t: 'Entregues', v: (g) => g.ent, f: (g) => n0(g.ent) },
      { k: 'pp', t: '% no prazo', v: (g) => (g.comPrev ? g.noPrazo / g.comPrev : -1), f: (g) => pct(g.noPrazo, g.comPrev) },
      { k: 'atr', t: 'Atrasados', v: (g) => g.atr, f: (g) => n0(g.atr) },
      { k: 'atrm', t: 'Atraso médio', v: (g) => (g.atr ? g.atrDias / g.atr : 0), f: (g) => (g.atr ? `${n0(Math.round((g.atrDias / g.atr) * 10) / 10)} d` : '–') },
      { k: 'lead', t: 'Tempo médio', v: (g) => (g.nLead ? g.lead / g.nLead : 0), f: (g) => (g.nLead ? `${n0(Math.round((g.lead / g.nLead) * 10) / 10)} d` : '–') },
      { k: 'reent', t: 'Reentregas', v: (g) => g.reent, f: (g) => n0(g.reent) },
      { k: 'custo', t: 'Custo CTE', v: (g) => g.custo, f: (g) => rs(g.custo) },
      { k: 'cobr', t: 'Frete cobrado', v: (g) => g.cobrado, f: (g) => rs(g.cobrado) },
      { k: 'dif', t: 'Cobrado − CTE', v: (g) => g.cobrado - g.custo, f: (g) => rs(g.cobrado - g.custo) },
    ];
    const { k, asc } = this.e.ordRank;
    const c = cols.find((x) => x.k === k) || cols[0];
    const linhas = [...m.values()].sort((a, b) => (asc ? c.v(a) - c.v(b) : c.v(b) - c.v(a)));
    const cab = `<th>#</th><th>Transportadora</th>${cols.map((x) => `<th class="dir ${x.k === c.k ? 'ord' + (asc ? ' asc' : '') : ''}" data-ord-rank="${x.k}">${x.t}</th>`).join('')}`;
    const corpo = linhas
      .map((g, i) => `<tr class="sem-clique"><td class="num">${i + 1}</td><td>${esc(g.nome)}</td>${cols.map((x) => `<td class="dir num ${x.k === 'dif' && g.cobrado - g.custo < 0 ? 'crit-txt' : ''}">${x.f(g)}</td>`).join('')}</tr>`)
      .join('');
    return `<div class="tabela-wrap"><table><thead><tr>${cab}</tr></thead><tbody>${corpo}</tbody></table></div><p class="nota">% no prazo e atraso pela previsão da transportadora; pedidos sem previsão ficam fora do percentual. Tempo médio = do envio à entrega.</p>`;
  }

  private acumulado(enviados: Reg[]): string {
    if (!enviados.length) return '<p class="muted">Nenhum pedido enviado no recorte.</p>';
    const med = this.e.medida;
    const val = (r: Reg) => (med === 'custo' ? r.custo : med === 'cobrado' ? r.cobrado : 1);
    const f = (v: number) => (med === 'pedidos' ? n0(v) : rs0(v));
    const seg = `<div class="seg" role="group" aria-label="Medida">${(
      [
        ['custo', 'Custo CTE'],
        ['cobrado', 'Frete cobrado'],
        ['pedidos', 'Pedidos'],
      ] as const
    )
      .map(([k, t]) => `<button type="button" data-medida="${k}" aria-pressed="${med === k}">${t}</button>`)
      .join('')}</div>`;
    const tabela = (chave: (r: Reg) => string, rot: (c: string) => string, titulo: string) => {
      const cols = [...new Set(enviados.map(chave))].sort();
      const lin = new Map<string, { nome: string; v: Map<string, number>; t: number }>();
      enviados.forEach((r) => {
        const k = r.p.transportadora || '-';
        const g = lin.get(k) || { nome: this.transpNome(r), v: new Map(), t: 0 };
        const c = chave(r);
        g.v.set(c, (g.v.get(c) || 0) + val(r));
        g.t += val(r);
        lin.set(k, g);
      });
      const linhas = [...lin.values()].sort((a, b) => b.t - a.t);
      const totCol = cols.map((c) => linhas.reduce((s, g) => s + (g.v.get(c) || 0), 0));
      const totGeral = totCol.reduce((s, x) => s + x, 0);
      return `<h3 class="sub-tab">${titulo}</h3><div class="tabela-wrap"><table class="cruzada"><thead><tr><th>Transportadora</th>${cols.map((c) => `<th class="dir">${esc(rot(c))}</th>`).join('')}<th class="dir">Total</th></tr></thead><tbody>${linhas
        .map((g) => `<tr class="sem-clique"><td class="quebra">${esc(g.nome)}</td>${cols.map((c) => `<td class="dir num">${g.v.get(c) ? f(g.v.get(c) as number) : ''}</td>`).join('')}<td class="dir num"><b>${f(g.t)}</b></td></tr>`)
        .join('')}<tr class="total sem-clique"><td>Total</td>${totCol.map((v) => `<td class="dir num">${f(v)}</td>`).join('')}<td class="dir num">${f(totGeral)}</td></tr></tbody></table></div>`;
    };
    return `<div class="pilha-h">${seg}</div>
      ${tabela((r) => r.p.dataEnvio.slice(0, 7), rotMes, 'Mensal')}
      ${tabela((r) => r.p.dataEnvio.slice(0, 4), (c) => c, 'Anual')}`;
  }

  // ---------- Gaveta do pedido (consulta + edicao) ----------
  private gaveta(recno: number): void {
    const r = this.reg(recno);
    if (!r) return;
    this.aberto = recno;
    const p = r.p;
    const falta = (k: keyof PedidoEdicao) => this.faltando.has(CAMPO[k]);
    const faturado = (p.notas || []).length > 0;
    const tam = this.resp?.tamanhos || {};
    const dis = (k: keyof PedidoEdicao, extra = false) => (falta(k) || extra ? 'disabled' : '');
    const tit = (k: keyof PedidoEdicao) => (falta(k) ? `title="${CAMPO[k]} ainda não existe neste ambiente"` : '');
    const data = (k: keyof PedidoEdicao, rot: string, v: string, extra = false, hoje = true) =>
      `<div class="campo"><label for="f-${k}">${rot}</label><div class="com-hoje"><input id="f-${k}" type="date" data-f="${k}" value="${esc(v)}" ${dis(k, extra)} ${tit(k)}>${hoje ? `<button type="button" class="btn-txt" data-hoje="${k}" ${dis(k, extra)}>Hoje</button>` : ''}</div></div>`;
    const texto = (k: keyof PedidoEdicao, rot: string, v: string, extra = false) =>
      `<div class="campo"><label for="f-${k}">${rot}</label><input id="f-${k}" type="text" data-f="${k}" value="${esc(v)}" ${tam[CAMPO[k]] ? `maxlength="${tam[CAMPO[k]]}"` : ''} ${dis(k, extra)} ${tit(k)}></div>`;
    const num = (k: keyof PedidoEdicao, rot: string, v: number, extra = false) =>
      `<div class="campo"><label for="f-${k}">${rot}</label><input id="f-${k}" type="text" inputmode="decimal" data-f="${k}" value="${esc(k === 'volume' ? (v ? String(v) : '') : k === 'pesoLiquido' || k === 'pesoBruto' ? pesoTxt(v) : numTxt(v))}" ${dis(k, extra)} ${tit(k)}></div>`;
    // Frete: so consulta (sem data-f: nao entra no formulario nem no PUT)
    const fixo = (rot: string, campo: string, v: string) =>
      `<div class="campo"><label>${rot}</label><input type="text" class="so-leitura" value="${esc(v)}" readonly tabindex="-1" title="${campo}: só consulta, não é alterado aqui"></div>`;
    const combo = (k: keyof PedidoEdicao, rot: string, ops: Opcao[], v: string, extra = false) =>
      `<div class="campo"><label for="f-${k}">${rot}</label><select id="f-${k}" data-f="${k}" ${dis(k, extra)} ${tit(k)}><option value="">(não informado)</option>${ops.map(([c, t]) => `<option value="${esc(c)}" ${c === v ? 'selected' : ''}>${esc(c)} - ${esc(t)}</option>`).join('')}${v && !ops.some(([c]) => c === v) ? `<option value="${esc(v)}" selected>${esc(v)}</option>` : ''}</select></div>`;
    const transps = this.resp?.transportadoras || [];
    const reent = p.reentrega === 'SIM';

    const itens = (p.itens || [])
      .map(
        (i) =>
          `<tr class="sem-clique"><td class="quebra">${esc(i.descricao)}<span class="cod-linha">${esc(i.produto)} · item ${esc(i.item)}</span>${this.seriesItem(i)}</td><td class="dir num">${n0(i.quantidade)}</td><td class="dir num">${rs(i.valor)}</td><td>${esc(i.tes)}<span class="cod-linha">${esc(i.descTes)}</span></td><td>${i.nota ? `${esc(i.nota)}<span class="cod-linha">${fmt(i.dataFat)}</span>` : '<span class="muted">sem NF</span>'}</td></tr>`,
      )
      .join('');
    const passos: [string, string][] = [
      ['Emissão do pedido', p.emissao],
      ['Saída programada (C5_FECENT)', p.previsaoSaida],
      ['Faturamento (NF)', p.dataFaturamento],
      ['Envio (saiu da empresa)', p.dataEnvio],
      ['Previsão da transportadora', p.dataPrevisao],
      ['Entrega', p.dataEntrega],
    ];
    if (reent) passos.push(['Nova entrega (reentrega)', p.dataNovaEntrega]);
    r.envs.slice(1).filter((e) => !e.junto).forEach((e) => {
      passos.push([`${e.idx + 1}º envio (NF ${e.nf})`, e.dataEnvio]);
      passos.push([`Entrega do ${e.idx + 1}º envio`, e.entFinal]);
    });
    if (p.dataRetorno) passos.push(['Retorno à empresa', p.dataRetorno]);
    if (p.finalizado === 'S') passos.push([`Finalizado sem entrega${p.motivoFinal ? ` (${this.txtOp('motivoFinal', p.motivoFinal)})` : ''}`, p.dataFinal || '']);
    if (p.finalizado === 'S' && p.dataReembolso) passos.push(['Reembolso do extravio', p.dataReembolso]);
    // este pedido e o reenvio de outro (que voltou, extraviou ou foi finalizado)?
    const origem = this.regs.filter((x) => x.p.pedidoReenvio === p.pedido || (x.p.finalizado === 'S' && x.p.pedidoFinal === p.pedido)).map((x) => x.p.pedido);
    const finS = p.finalizado === 'S';
    const zlhOk = !falta('finalizado');
    const tempo = passos
      .map(([t, d]) => `<li class="${d ? '' : 'vazio'}"><b>${esc(t)}</b><br><span class="${d ? '' : 'muted'}">${d ? fmt(d) : 'não informado'}</span></li>`)
      .join('');
    const comCustos = this.temCustos;
    // gaveta nova: sem cobranca em edicao; o historico e lido quando o bloco abre
    if (!this.hist || this.hist.pedido !== p.pedido) {
      this.custoEdit = null;
      this.custosAbertos = false;
      this.hist = null;
    }

    this.el.camada.innerHTML = `<div class="fundo" data-acao="fechar"></div>
      <aside class="gaveta" role="dialog" aria-modal="true" aria-label="Pedido ${esc(p.pedido)}">
        <header><div>
          <h2>Pedido <span class="mono">${esc(p.pedido)}</span></h2>
          <span class="titulo-item">${esc(p.nome)}</span>
          <span class="pilha-h"><span class="pill etapa" style="--cor:${ET[r.et].cor}">${esc(ET[r.et].curto)}</span>${this.pillPrazo(r)}${reent ? '<span class="pill reent">Reentrega</span>' : ''}${r.parcial ? '<span class="pill semprev">NF parcial</span>' : ''}${r.et === 'ret' && !p.pedidoReenvio ? '<span class="pill atrasado">Aguardando reenvio</span>' : ''}${r.et === 'fin' ? this.pillsFinal(p).join('') : ''}${origem.length ? `<span class="pill mat">Reenvio do pedido ${esc(origem.join(', '))}</span>` : ''}</span>
        </div><button class="fechar" data-acao="fechar" aria-label="Fechar">×</button></header>
        <div class="rolar">
          ${this.barraNotas(p)}
          <form class="form-log" id="lg-form" autocomplete="off">
            <fieldset class="grupo-f"><legend>Dados do pedido</legend>
              ${faturado ? '<p class="nota inteiro">Pedido com nota fiscal: transportadora, tipo do frete, volume, espécie e pesos já saíram na NF e não são alterados aqui.</p>' : '<p class="nota inteiro">Espécie, peso líquido e peso bruto têm que estar preenchidos antes da emissão da NF-e.</p>'}
              <div class="campo inteiro"><label for="f-transportadora">Transportadora</label><input id="f-transportadora" list="lg-transps" data-f="transportadora" value="${esc(p.transportadora ? `${p.transportadora} - ${p.transportadoraNome}` : '')}" placeholder="Código ou nome" ${dis('transportadora', faturado)}>
                <datalist id="lg-transps">${transps.map(([c, n]) => `<option value="${esc(c)} - ${esc(n)}"></option>`).join('')}</datalist></div>
              ${combo('tipoFrete', 'Tipo do frete', this.op('tipoFrete'), p.tipoFrete || '', faturado)}
              ${num('volume', 'Volume', p.volume, faturado)}
              ${texto('especie', 'Espécie', p.especie || '', faturado)}
              ${num('pesoLiquido', 'Peso líquido', p.pesoLiquido || 0, faturado)}
              ${num('pesoBruto', 'Peso bruto', p.pesoBruto || 0, faturado)}
              ${fixo('Frete destacado (R$)', 'C5_FRETE', numTxt(p.frete) || '0,00')}
              ${fixo('Frete não destacado (R$)', 'C5_ZFRETE', numTxt(p.freteNaoDestacado) || '0,00')}
              ${p.freteNaoDestacadoTexto && numBR(p.freteNaoDestacadoTexto) !== p.freteNaoDestacado ? `<p class="nota inteiro">Frete não destacado gravado como texto: "${esc(p.freteNaoDestacadoTexto)}".</p>` : ''}
            </fieldset>
            <fieldset class="grupo-f"><legend>Envio e entrega${r.envs.length ? ` · 1º envio (NF ${esc(r.envs[0].nf)})` : ''}</legend>
              ${data('previsaoSaida', 'Saída programada (C5_FECENT)', p.previsaoSaida)}
              ${data('dataEnvio', 'Data de envio', p.dataEnvio)}
              ${data('dataPrevisao', 'Previsão de entrega (transportadora)', p.dataPrevisao, false, false)}
              ${data('dataEntrega', 'Data de entrega', p.dataEntrega)}
              ${combo('tipoMaterial', 'Tipo de material', this.op('tipoMaterial'), p.tipoMaterial)}
              ${combo('indicador', 'Indicador de atraso', this.op('indicador'), p.indicador)}
              <div class="campo inteiro" id="lg-obsind" ${this.indOutros(p.indicador) ? '' : 'hidden'}><label for="f-obsIndicador">O que aconteceu? (indicador "Outros")</label><textarea id="f-obsIndicador" data-f="obsIndicador" rows="2" ${tam[CAMPO.obsIndicador] ? `maxlength="${tam[CAMPO.obsIndicador]}"` : ''} placeholder="Descreva o motivo do atraso" ${dis('obsIndicador')} ${tit('obsIndicador')}>${esc(p.obsIndicador || '')}</textarea></div>
              <div class="campo inteiro"><label for="f-obsEntrega">Observações da entrega</label><textarea id="f-obsEntrega" data-f="obsEntrega" rows="3" ${tam[CAMPO.obsEntrega] ? `maxlength="${tam[CAMPO.obsEntrega]}"` : ''} placeholder="Texto livre: horário de recebimento, contato, acesso…" ${dis('obsEntrega')} ${tit('obsEntrega')}>${esc(p.obsEntrega || '')}</textarea></div>
            </fieldset>
            ${r.envs.length ? `<div id="lg-envios">${this.enviosHtml(r)}</div>` : ''}
            ${comCustos ? `<div id="lg-custos">${this.custosHtml(r)}</div>` : ''}
            ${comCustos ? '' : `<fieldset class="grupo-f"><legend>CTE da transportadora</legend>
              ${texto('cte', 'Número do CTE', p.cte)}
              ${num('valorCte', 'Valor do CTE (R$)', p.valorCte)}
            </fieldset>`}
            <fieldset class="grupo-f"><legend>Reentrega</legend>
              <div class="campo"><label>Gerou reentrega?</label><div class="radios">
                <label><input type="radio" name="reentrega" data-f="reentrega" value="N" ${!reent ? 'checked' : ''} ${dis('reentrega')}> Não</label>
                <label><input type="radio" name="reentrega" data-f="reentrega" value="S" ${reent ? 'checked' : ''} ${dis('reentrega')}> Sim</label></div></div>
              ${comCustos ? '' : texto('cteReentrega', 'CTE da reentrega', p.cteReentrega, !reent)}
              ${comCustos ? '' : num('valorCteReentrega', 'Valor do CTE da reentrega (R$)', p.valorCteReentrega, !reent)}
              ${data('dataNovaEntrega', 'Nova data de entrega', p.dataNovaEntrega, !reent)}
            </fieldset>
            <fieldset class="grupo-f"><legend>Retorno à empresa</legend>
              <p class="nota inteiro">A mercadoria voltou e será reenviada em outro pedido. Com a data, o pedido vai para Retornados.</p>
              ${data('dataRetorno', 'Data do retorno', p.dataRetorno || '')}
              ${combo('motivoRetorno', 'Motivo do retorno', this.op('motivoRetorno'), p.motivoRetorno || '')}
              <div class="campo"><label for="f-pedidoReenvio">Pedido do reenvio</label><input id="f-pedidoReenvio" type="text" data-f="pedidoReenvio" value="${esc(p.pedidoReenvio || '')}" maxlength="6" placeholder="Nº do novo pedido" ${dis('pedidoReenvio')} ${tit('pedidoReenvio')}></div>
              <div class="campo inteiro"><label for="f-obsRetorno">Observação do retorno</label><textarea id="f-obsRetorno" data-f="obsRetorno" rows="3" ${tam[CAMPO.obsRetorno] ? `maxlength="${tam[CAMPO.obsRetorno]}"` : ''} placeholder="Texto livre: o que voltou, estado da mercadoria, combinado com o cliente…" ${dis('obsRetorno')} ${tit('obsRetorno')}>${esc(p.obsRetorno || '')}</textarea></div>
            </fieldset>
            <fieldset class="grupo-f grupo-fin"><legend>Finalizar sem entrega</legend>
              <p class="nota inteiro">Para o pedido que não vai ter data de entrega: extravio, mercadoria enviada em outro pedido ou outro motivo. Marcado, o pedido sai dos quadros em aberto e vai para "Retornados e finalizados".${zlhOk ? '' : ' <b>Indisponível: falta o campo ZLH_OBS na tabela de histórico (ZLH) deste ambiente.</b>'}</p>
              <div class="campo inteiro"><label class="check-fin"><input type="checkbox" id="f-finalizado" data-f="finalizado" value="S" ${finS ? 'checked' : ''} ${dis('finalizado')} ${tit('finalizado')}> Pedido finalizado sem data de entrega</label></div>
              ${combo('motivoFinal', 'Motivo', this.op('motivoFinal'), p.motivoFinal || '')}
              ${data('dataFinal', 'Data (no extravio, a data do extravio)', p.dataFinal || '')}
              <div class="campo"><label for="f-pedidoFinal">Enviado no pedido</label><input id="f-pedidoFinal" type="text" data-f="pedidoFinal" value="${esc(p.pedidoFinal || '')}" maxlength="6" placeholder="Nº do pedido que levou a mercadoria" ${dis('pedidoFinal')} ${tit('pedidoFinal')}></div>
              ${combo('reembolso', 'Reembolso do extravio', this.op('reembolso'), p.reembolso || '')}
              ${num('valorReembolso', 'Valor do reembolso (R$)', p.valorReembolso || 0)}
              ${data('dataReembolso', 'Data do reembolso', p.dataReembolso || '')}
              <div class="campo inteiro"><label for="f-obsFinal">Observação</label><textarea id="f-obsFinal" data-f="obsFinal" rows="2" ${tam[CAMPO.obsFinal] ? `maxlength="${tam[CAMPO.obsFinal]}"` : ''} placeholder="Ex.: protocolo da transportadora, combinado com o cliente…" ${dis('obsFinal')} ${tit('obsFinal')}>${esc(p.obsFinal || '')}</textarea></div>
            </fieldset>
            <ul class="avisos-f" id="lg-avisos" aria-live="polite"></ul>
          </form>

          <section id="lg-frete">${this.freteHtml(r)}</section>

          <section><h3>Cliente e pedido</h3>
            <dl class="grade-info">
              <div><dt>Cliente / loja</dt><dd>${esc(p.cliente)} / ${esc(p.loja)}</dd></div>
              <div><dt>Nome</dt><dd>${esc(p.nome)}</dd></div>
              <div><dt>Grupo do cliente</dt><dd>${esc(p.grupo || '–')}</dd></div>
              <div><dt>Entrega</dt><dd>${esc([p.cidade, p.uf].filter(Boolean).join(' / ') || '–')}${p.nomeEntrega && p.nomeEntrega !== p.nome ? `<br><span class="muted">${esc(p.clienteEntrega)} ${esc(p.nomeEntrega)}</span>` : ''}</dd></div>
              <div class="inteiro"><dt>Endereço de entrega</dt><dd>${esc(this.enderecoTxt(p) || '–')}</dd></div>
              <div><dt>Telefone${p.telefoneCliente && p.telefoneCliente !== p.telefone ? ' (entrega)' : ''}</dt><dd>${this.foneHtml(p.telefone)}</dd></div>
              ${p.telefoneCliente && p.telefoneCliente !== p.telefone ? `<div><dt>Telefone (cliente do pedido)</dt><dd>${this.foneHtml(p.telefoneCliente)}</dd></div>` : ''}
              <div><dt>Vendedor</dt><dd>${esc(p.vendedor || p.codVendedor || '–')}</dd></div>
              <div><dt>Tipo do pedido</dt><dd>${esc(this.txtOp('tipoPedido', p.tipoPedido) || '–')}</dd></div>
              <div><dt>Notas fiscais</dt><dd>${esc((p.notas || []).join(', ') || '–')}</dd></div>
              <div><dt>Valor dos itens</dt><dd>${rs(r.valor)} · ${n0(r.qtd)} un</dd></div>
              <div class="inteiro"><dt>Mensagem para a nota (C5_MENNOTA)</dt><dd class="quebra">${p.mensagemNota ? esc(p.mensagemNota) : '<span class="muted">sem mensagem</span>'}</dd></div>
            </dl></section>

          <section><h3>Itens</h3>
            <div class="tabela-wrap"><table><thead><tr><th>Produto</th><th class="dir">Qtd</th><th class="dir">Valor total</th><th>TES</th><th>NF</th></tr></thead><tbody>${itens}</tbody></table></div></section>

          <section><h3>Linha do tempo</h3><ul class="linha-tempo">${tempo}</ul></section>
          ${this.resp?.temHistorico ? `<details class="bloco-d" id="lg-hist" ${this.hist ? 'open' : ''}><summary data-acao="hist"><b>Histórico de alterações</b> <span class="muted">quem mudou o quê e quando</span></summary><div id="lg-hist-corpo">${this.histHtml()}</div></details>` : ''}
        </div>
        <footer class="rodape-gaveta">
          <span class="muted" id="lg-sujo"></span>
          <button type="button" class="btn" data-acao="fechar">Fechar</button>
          <button type="button" class="btn pri" data-acao="salvar" id="lg-salvar">Salvar</button>
        </footer>
      </aside>`;
    this.atualizarForm();
  }

  // ---------- Exportar XLSX (19/11/2026, pedido do usuario) ----------
  /** Recortes do Exportar XLSX: [id, texto, filtro] */
  private recortesXlsx(): [string, string, (r: Reg) => boolean][] {
    const lista: [string, string, (r: Reg) => boolean][] = [
      ['todos', 'Todos os pedidos', () => true],
      ['prev', 'Previstos (sem NF)', (r) => r.et === 'prev'],
      ['fat', 'Faturados, aguardando saída', (r) => r.et === 'fat'],
      ['env', 'Enviados (em trânsito)', (r) => r.et === 'env'],
      ['ent', 'Entregues', (r) => r.et === 'ent'],
      ['atr', 'Atrasados (em trânsito e entregues com atraso)', (r) => r.prazo === 'atrasado'],
      ['ret', 'Retornados', (r) => r.et === 'ret'],
      ['fin', 'Finalizados sem entrega (extravio, outro pedido…)', (r) => r.et === 'fin'],
    ];
    if (this.temCustos) lista.push(['div', 'Com custo de frete em divergência', (r) => r.nDiv > 0]);
    return lista;
  }

  private abrirXlsx(): void {
    if (!this.regs.length) {
      this.aviso('Nenhum pedido carregado para exportar.', true);
      return;
    }
    const g = ler<{ recorte?: string; filtros?: boolean; abas?: string[] }>('xlsx', {});
    this.fecharModal();
    this.xl ={ recorte: g.recorte || 'todos', filtros: g.filtros ?? true, abas: new Set(g.abas?.length ? g.abas : ['ped', 'itens', 'envios', 'custos']) };
    this.desenharXlsx();
  }

  /** Pedidos do recorte escolhido (com ou sem os filtros do topo) */
  private regsXlsx(recorte: string, filtros: boolean): Reg[] {
    const f = this.recortesXlsx().find(([id]) => id === recorte)?.[2] || (() => true);
    return (filtros ? this.base() : this.regs).filter(f).sort((a, b) => a.p.pedido.localeCompare(b.p.pedido));
  }

  private desenharXlsx(): void {
    const x = this.xl;
    if (!x) return;
    const filtrosAtivos = this.base().length !== this.regs.length;
    const recs = this.recortesXlsx()
      .map(([id, txt]) => {
        const n = this.regsXlsx(id, x.filtros).length;
        return `<label class="xl-op"><input type="radio" name="xl-rec" value="${id}" ${x.recorte === id ? 'checked' : ''}><span>${esc(txt)}</span><span class="muted">${n0(n)} pedido${n === 1 ? '' : 's'}</span></label>`;
      })
      .join('');
    const abas: [string, string][] = [
      ['ped', 'Pedidos: uma linha por pedido, com todos os dados de logística e frete'],
      ['itens', 'Itens: uma linha por item do pedido (produto, quantidade, NF, números de série)'],
    ];
    abas.push(['envios', 'Envios: uma linha por envio (NF), com datas, transportadora e custo de cada um; o pedido faturado em partes tem uma linha por NF']);
    if (this.temCustos) abas.push(['custos', 'Custos de frete: uma linha por cobrança (CTE, reentregas, taxas)']);
    const sel = this.regsXlsx(x.recorte, x.filtros);
    const nItens = sel.reduce((s, r) => s + (r.p.itens || []).length, 0);
    const nCus = sel.reduce((s, r) => s + (r.p.custos || []).length, 0);
    const vazio = !sel.length || !abas.some(([k]) => x.abas.has(k));
    const corpo = `<div id="lg-xlsx">
      <fieldset class="xl-grupo"><legend>O que exportar</legend>${recs}</fieldset>
      <label class="xl-op"><input type="checkbox" name="xl-filtros" ${x.filtros ? 'checked' : ''}><span>Aplicar os filtros da tela (busca, transportadora, UF, material, tipo, situação e datas)${filtrosAtivos ? '' : ' <i class="muted">· nenhum filtro ativo agora</i>'}</span></label>
      <fieldset class="xl-grupo"><legend>Abas da planilha</legend>${abas.map(([k, t]) => `<label class="xl-op"><input type="checkbox" name="xl-aba" value="${k}" ${x.abas.has(k) ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('')}</fieldset>
      <p class="nota">${n0(sel.length)} pedidos · ${n0(nItens)} itens${this.temCustos ? ` · ${n0(nCus)} cobranças de frete` : ''}. Cada aba sai como tabela do Excel (filtro e listras), fonte Tahoma 10.</p>
    </div>`;
    this.el.camada.querySelectorAll('.modal, .fundo-modal').forEach((m) => m.remove());
    this.el.camada.insertAdjacentHTML(
      'beforeend',
      `<div class="fundo fundo-modal" data-acao="fechar-modal"></div><div class="modal xl" role="dialog" aria-modal="true" aria-label="Exportar XLSX"><header><h2>Exportar planilha (XLSX)</h2><p>Dados carregados na tela (consulta de ${fmt(this.resp?.de || '')} a ${fmt(this.resp?.ate || '')} para os pedidos com NF; os sem NF vêm todos).</p></header><div class="corpo">${corpo}</div><footer><button type="button" class="btn" data-acao="fechar-modal">Cancelar</button><button type="button" class="btn pri" data-acao="xlsx-gerar" ${vazio ? 'disabled' : ''}>Exportar</button></footer></div>`,
    );
  }

  private gerarXlsxArquivo(): void {
    const x = this.xl;
    if (!x) return;
    const sel = this.regsXlsx(x.recorte, x.filtros);
    if (!sel.length) return;
    const cus = this.temCustos;
    const sn = (v: string) => (v === 'SIM' ? 'Sim' : v === 'NAO' ? 'Não' : v);
    const tr = (p: Pedido) => p.transportadoraNome || p.transportadora;
    const abas: AbaXlsx[] = [];
    if (x.abas.has('ped')) {
      const col: [string, 'txt' | 'num' | 'data', (r: Reg) => string | number][] = [
        ['Pedido', 'txt', (r) => r.p.pedido],
        ['Quadro', 'txt', (r) => ET[r.et].curto],
        ['Situação da entrega', 'txt', (r) => PRAZO_TXT[r.prazo]],
        ['Dias de atraso', 'num', (r) => (r.prazo === 'atrasado' && r.atraso !== null ? r.atraso : '')],
        ['Emissão', 'data', (r) => r.p.emissao],
        ['Tipo de pedido', 'txt', (r) => this.txtOp('tipoPedido', r.p.tipoPedido)],
        ['Cliente', 'txt', (r) => r.p.cliente],
        ['Loja', 'txt', (r) => r.p.loja],
        ['Nome', 'txt', (r) => r.p.nome],
        ['Nome fantasia', 'txt', (r) => r.p.fantasia],
        ['Grupo do cliente', 'txt', (r) => r.p.grupo],
        ['Cidade de entrega', 'txt', (r) => r.p.cidade],
        ['UF', 'txt', (r) => r.p.uf],
        ['Telefone (entrega)', 'txt', (r) => r.p.telefone || ''],
        ['Telefone (cliente do pedido)', 'txt', (r) => r.p.telefoneCliente || ''],
        ['Endereço de entrega', 'txt', (r) => [r.p.enderecoEntrega, r.p.complementoEntrega].filter(Boolean).join(' - ')],
        ['Bairro', 'txt', (r) => r.p.bairroEntrega || ''],
        ['CEP', 'txt', (r) => r.p.cepEntrega || ''],
        ['Vendedor', 'txt', (r) => r.p.vendedor],
        ['Cód. transportadora', 'txt', (r) => r.p.transportadora],
        ['Transportadora', 'txt', (r) => r.p.transportadoraNome],
        ['Tipo do frete', 'txt', (r) => this.txtOp('tipoFrete', r.p.tipoFrete || '')],
        ['Notas fiscais', 'txt', (r) => (r.p.notas || []).join(', ')],
        ['Faturamento', 'data', (r) => r.p.dataFaturamento],
        ['Saída programada', 'data', (r) => r.p.previsaoSaida],
        ['Envio', 'data', (r) => r.p.dataEnvio],
        ['Previsão de entrega', 'data', (r) => r.p.dataPrevisao],
        ['Data de entrega', 'data', (r) => r.p.dataEntrega],
        ['Gerou reentrega', 'txt', (r) => sn(r.p.reentrega)],
        ['Nova data de entrega', 'data', (r) => r.p.dataNovaEntrega],
        ['Entrega final', 'data', (r) => r.entFinal],
        ['Indicador de atraso', 'txt', (r) => this.txtOp('indicador', r.p.indicador)],
        ['Tipo de material', 'txt', (r) => this.txtOp('tipoMaterial', r.p.tipoMaterial)],
        ['Data do retorno', 'data', (r) => r.p.dataRetorno || ''],
        ['Motivo do retorno', 'txt', (r) => this.txtOp('motivoRetorno', r.p.motivoRetorno || '')],
        ['Pedido do reenvio', 'txt', (r) => r.p.pedidoReenvio || ''],
        ['Observação do retorno', 'txt', (r) => r.p.obsRetorno || ''],
        ['Finalizado sem entrega', 'txt', (r) => (r.p.finalizado === 'S' ? this.txtOp('motivoFinal', r.p.motivoFinal || '') || 'Sim' : '')],
        ['Data da finalização', 'data', (r) => (r.p.finalizado === 'S' ? r.p.dataFinal || '' : '')],
        ['Enviado no pedido', 'txt', (r) => (r.p.finalizado === 'S' ? r.p.pedidoFinal || '' : '')],
        ['Reembolso do extravio', 'txt', (r) => (r.p.finalizado === 'S' && r.p.motivoFinal === 'E' ? this.txtOp('reembolso', r.p.reembolso || '') || 'Pendente' : '')],
        ['Valor do reembolso', 'num', (r) => (r.p.finalizado === 'S' && r.p.valorReembolso ? r.p.valorReembolso : '')],
        ['Data do reembolso', 'data', (r) => (r.p.finalizado === 'S' ? r.p.dataReembolso || '' : '')],
        ['Observação da finalização', 'txt', (r) => (r.p.finalizado === 'S' ? r.p.obsFinal || '' : '')],
        ['Indicador: o que aconteceu', 'txt', (r) => r.p.obsIndicador || ''],
        ['Volume', 'num', (r) => r.p.volume || ''],
        ['Espécie', 'txt', (r) => r.p.especie || ''],
        ['Peso líquido', 'num', (r) => r.p.pesoLiquido || ''],
        ['Peso bruto', 'num', (r) => r.p.pesoBruto || ''],
        ['Quantidade (un)', 'num', (r) => r.qtd],
        ['Valor dos itens', 'num', (r) => r.valor],
        ['Frete destacado', 'num', (r) => r.p.frete || 0],
        ['Frete não destacado', 'num', (r) => r.p.freteNaoDestacado || 0],
        ['Frete cobrado', 'num', (r) => r.cobrado],
        ...(cus
          ? ([
              ['CTEs', 'txt', (r: Reg) => r.ctes.join(' / ')],
              ['Cobranças de frete', 'num', (r: Reg) => (r.p.custos || []).length],
              ['Custo de frete', 'num', (r: Reg) => r.custo],
              ['Cobranças em divergência', 'num', (r: Reg) => r.nDiv || ''],
              ['Acima do esperado', 'num', (r: Reg) => r.difDiv || ''],
            ] as [string, 'txt' | 'num' | 'data', (r: Reg) => string | number][])
          : ([
              ['CTE', 'txt', (r: Reg) => r.p.cte],
              ['Valor do CTE', 'num', (r: Reg) => r.p.valorCte || 0],
              ['CTE da reentrega', 'txt', (r: Reg) => r.p.cteReentrega],
              ['Valor do CTE da reentrega', 'num', (r: Reg) => r.p.valorCteReentrega || 0],
              ['Custo de frete', 'num', (r: Reg) => r.custo],
            ] as [string, 'txt' | 'num' | 'data', (r: Reg) => string | number][])),
        ['Cobrado − custo', 'num', (r) => (r.custo ? Math.round((r.cobrado - r.custo) * 100) / 100 : '')],
        ['Observações da entrega', 'txt', (r) => r.p.obsEntrega || ''],
        ['Mensagem para a nota', 'txt', (r) => r.p.mensagemNota || ''],
        ['Informação faltando', 'txt', (r) => r.pend.map((k) => PEND_TXT[k][1]).join(', ')],
      ];
      abas.push({ nome: 'Pedidos', tabela: 'Pedidos', colunas: col.map(([t, tipo]) => ({ t, tipo })), linhas: sel.map((r) => col.map(([, , f]) => f(r))) });
    }
    if (x.abas.has('itens')) {
      const linhas: (string | number)[][] = [];
      sel.forEach((r) =>
        (r.p.itens || []).forEach((i) =>
          linhas.push([r.p.pedido, i.item, ET[r.et].curto, r.p.fantasia || r.p.nome, tr(r.p), i.produto, i.descricao, i.quantidade, i.entregue, i.valor, i.tes, i.descTes, i.nota, i.nota ? i.serie : '', i.dataFat, (i.numerosSerie || []).map((s) => s[0]).join(', '), r.p.dataEnvio, r.entFinal]),
        ),
      );
      abas.push({
        nome: 'Itens',
        tabela: 'Itens',
        colunas: [
          { t: 'Pedido' }, { t: 'Item' }, { t: 'Quadro' }, { t: 'Cliente' }, { t: 'Transportadora' }, { t: 'Produto' }, { t: 'Descrição' },
          { t: 'Quantidade', tipo: 'num' }, { t: 'Entregue', tipo: 'num' }, { t: 'Valor', tipo: 'num' }, { t: 'TES' }, { t: 'Descrição da TES' },
          { t: 'NF' }, { t: 'Série da NF' }, { t: 'Data da NF', tipo: 'data' }, { t: 'Números de série' }, { t: 'Envio', tipo: 'data' }, { t: 'Entrega final', tipo: 'data' },
        ],
        linhas,
      });
    }
    if (cus && x.abas.has('custos')) {
      const linhas: (string | number)[][] = [];
      sel.forEach((r) =>
        (r.p.custos || []).forEach((c) => {
          const dif = EM_ABERTO.includes(c.situacao) && c.valorEsperado > 0 ? Math.round((c.valor - c.valorEsperado) * 100) / 100 : '';
          linhas.push([r.p.pedido, c.item, this.txtCusto('tipoCusto', c.tipo), c.cte, c.data, c.transportadoraNome || c.transportadora, c.valor, this.txtCusto('situacaoCusto', c.situacao), c.valorEsperado || '', dif, c.obs, c.usuario, c.alteradoEm, r.p.fantasia || r.p.nome, ET[r.et].curto, r.p.dataEnvio]);
        }),
      );
      abas.push({
        nome: 'Custos de frete',
        tabela: 'Custos',
        colunas: [
          { t: 'Pedido' }, { t: 'Item' }, { t: 'Tipo' }, { t: 'CTE / documento' }, { t: 'Data', tipo: 'data' }, { t: 'Transportadora' },
          { t: 'Valor cobrado', tipo: 'num' }, { t: 'Situação' }, { t: 'Valor esperado', tipo: 'num' }, { t: 'Diferença', tipo: 'num' },
          { t: 'Observação' }, { t: 'Alterado por' }, { t: 'Alterado em' }, { t: 'Cliente' }, { t: 'Quadro' }, { t: 'Envio', tipo: 'data' },
        ],
        linhas,
      });
    }
    if (x.abas.has('envios')) {
      // um registro por envio (NF): pedido de uma NF = 1 linha; faturado em partes = 1 por NF
      const linhas: (string | number)[][] = [];
      sel.forEach((r) => {
        if (!(r.p.notas || []).length) return;
        const lista = this.porEnvio([r]);
        lista.forEach((e, k) =>
          linhas.push([r.p.pedido, `${k + 1}º de ${lista.length}`, (e.p.notas || []).join(', '), e.p.dataFaturamento, r.p.fantasia || r.p.nome, e.p.transportadoraNome || e.p.transportadora, e.p.dataEnvio, e.p.dataPrevisao, e.entFinal, ET[e.et].curto, PRAZO_TXT[e.prazo], e.prazo === 'atrasado' && e.atraso !== null ? e.atraso : '', this.txtOp('tipoMaterial', e.p.tipoMaterial), this.txtOp('indicador', e.p.indicador), e.ctes.join(' / '), e.custo ? Math.round(e.custo * 100) / 100 : '', e.qtd]),
        );
      });
      abas.push({
        nome: 'Envios',
        tabela: 'Envios',
        colunas: [
          { t: 'Pedido' }, { t: 'Envio' }, { t: 'NF' }, { t: 'Faturamento', tipo: 'data' }, { t: 'Cliente' }, { t: 'Transportadora' },
          { t: 'Data de envio', tipo: 'data' }, { t: 'Previsão de entrega', tipo: 'data' }, { t: 'Entrega', tipo: 'data' }, { t: 'Quadro' }, { t: 'Situação da entrega' },
          { t: 'Dias de atraso', tipo: 'num' }, { t: 'Tipo de material' }, { t: 'Indicador de atraso' }, { t: 'CTEs' }, { t: 'Custo de frete', tipo: 'num' }, { t: 'Quantidade (un)', tipo: 'num' },
        ],
        linhas,
      });
    }
    if (!abas.length) return;
    try {
      const rec = x.recorte === 'todos' ? 'todos' : x.recorte;
      baixarXlsx(gerarXlsx(abas), `logistica-${rec}-${iso(this.hoje)}.xlsx`);
      this.aviso(`Planilha gerada: ${n0(sel.length)} pedidos${abas.length > 1 ? `, ${abas.length} abas` : ''}.`);
      this.fecharModal();
    } catch (e) {
      this.aviso(`Não foi possível gerar a planilha: ${String(e)}`, true);
    }
  }


  // ---------- Custos de frete (ZLC) e historico (ZLH), API 2026-11-19a ----------
  /** Frete cobrado x custo (bloco "Frete" da gaveta) */
  private freteHtml(r: Reg): string {
    const p = r.p;
    const dif = r.cobrado - r.custo;
    const rot = this.temCustos ? 'Custo de frete' : 'Custo de CTE';
    const det = this.temCustos
      ? (p.custos || []).length > 1
        ? ` <span class="muted">(${(p.custos || []).length} cobranças)</span>`
        : ''
      : p.valorCteReentrega
        ? ` <span class="muted">(reentrega ${rs(p.valorCteReentrega)})</span>`
        : '';
    return `<h3>Frete</h3>
      <dl class="grade-info">
        <div><dt>Cobrado no pedido</dt><dd>${rs(r.cobrado)} <span class="muted">(destacado ${rs(p.frete)} + não destacado ${rs(p.freteNaoDestacado)})</span></dd></div>
        <div><dt>${rot}</dt><dd>${rs(r.custo)}${det}</dd></div>
        <div><dt>Cobrado − custo</dt><dd class="${r.custo && dif < 0 ? 'crit-txt' : ''}">${r.custo ? rs(dif) : `<span class="muted">sem ${this.temCustos ? 'cobrança' : 'CTE'} lançado</span>`}</dd></div>
      </dl>`;
  }

  /** Bloco "Custos de frete" da gaveta: resumo, lista das cobrancas e o formulario */
  private custosHtml(r: Reg): string {
    const lista = r.p.custos || [];
    const resumo = lista.length
      ? `${n0(lista.length)} cobrança${lista.length > 1 ? 's' : ''} · ${rs(r.custo)}${r.nDiv ? ` · <b class="crit-txt">${r.nDiv} em divergência</b>` : ''}`
      : 'Nenhuma cobrança lançada';
    const linhas = lista
      .map((c) => {
        const ed = this.custoEdit === c.item;
        const dif = EM_ABERTO.includes(c.situacao) && c.valorEsperado > 0 ? c.valor - c.valorEsperado : 0;
        return `<tr class="sem-clique${ed ? ' editando' : ''}">
          <td class="mono">${esc(c.item)}</td>
          ${r.envs.length ? `<td class="mono">${esc(this.envioDaCobranca(r, c))}</td>` : ''}
          <td>${esc(this.txtCusto('tipoCusto', c.tipo))}</td>
          <td class="mono">${c.cte === SEM_CTE ? '<span class="pill semprev">Sem CTE</span>' : esc(c.cte) || '<span class="muted">–</span>'}</td>
          <td>${fmt(c.data) || '<span class="muted">–</span>'}</td>
          <td class="quebra">${esc(c.transportadoraNome || c.transportadora || '–')}</td>
          <td class="dir num">${rs(c.valor)}${c.cte === SEM_CTE && !c.valor ? '<span class="cod-linha muted">sem cobrança</span>' : ''}${dif ? `<span class="cod-linha crit-txt">esperado ${rs(c.valorEsperado)} (${dif > 0 ? '+' : ''}${rs(dif)})</span>` : ''}</td>
          <td><span class="pill ${COR_SITCUSTO[c.situacao] || 'semprev'}">${esc(this.txtCusto('situacaoCusto', c.situacao))}</span></td>
          <td class="dir"><button type="button" class="btn-txt" data-acao="custo-editar" data-item="${esc(c.item)}" ${this.salvandoCusto ? 'disabled' : ''}>Editar</button></td>
        </tr>${c.obs || c.usuario ? `<tr class="sem-clique sub"><td></td><td colspan="${r.envs.length ? 8 : 7}">${c.obs ? `${esc(c.obs)} · ` : ''}<span class="muted">${esc(c.usuario)}${c.alteradoEm ? ` em ${fmt(c.alteradoEm.slice(0, 10))} ${esc(c.alteradoEm.slice(11, 16))}` : ''}</span></td></tr>` : ''}`;
      })
      .join('');
    const tabela = lista.length
      ? `<div class="tabela-wrap"><table class="custos"><thead><tr><th>Item</th>${r.envs.length ? '<th>Envio</th>' : ''}<th>Tipo</th><th>CTE / doc.</th><th>Data</th><th>Transportadora</th><th class="dir">Valor</th><th>Situação</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`
      : '<p class="muted">Lance aqui o CTE do envio e cada cobrança extra: reentrega, armazenagem, devolução, outras taxas.</p>';
    const form = this.custoEdit !== null ? this.custoForm(r, lista.find((c) => c.item === this.custoEdit)) : `<p><button type="button" class="btn" data-acao="custo-novo" ${this.salvandoCusto ? 'disabled' : ''}>+ Adicionar cobrança</button></p>`;
    // grupo do formulario, sempre aberto (pedido do usuario, 19/11/2026): os
    // botoes sao type="button" e os campos nao tem data-f (nao entram no PUT)
    return `<fieldset class="grupo-f grupo-custos"><legend>Custos de frete</legend>
      <p class="inteiro resumo-custos">${resumo}</p>
      <div class="inteiro">${tabela}${form}</div></fieldset>`;
  }

  /** Formulario de uma cobranca (nova ou em edicao) */
  private custoForm(r: Reg, c?: Custo): string {
    const p = r.p;
    const lista = p.custos || [];
    // nova: Envio se ainda nao tem; Reentrega se o pedido teve reentrega; senao Outra taxa
    const tipoNovo = !lista.some((x) => x.tipo === 'E') ? 'E' : p.reentrega === 'SIM' && !lista.some((x) => x.tipo === 'R') ? 'R' : 'O';
    // cobranca nova de um envio parcial: transportadora daquele envio
    const envNovo = !c && this.custoNf ? r.envs.find((e) => e.nf === this.custoNf) : undefined;
    const v = c || { item: '', tipo: envNovo ? 'E' : tipoNovo, cte: '', data: iso(this.hoje), transportadora: envNovo ? envNovo.transportadora : p.transportadora, transportadoraNome: envNovo ? '' : p.transportadoraNome, valor: 0, situacao: '', valorEsperado: 0, obs: '', usuario: '', alteradoEm: '', nf: this.custoNf };
    // envios parciais: a qual envio (NF) a cobranca pertence (ZLC_NF); vazio = 1o envio
    const nfSel = c ? (c.nf && c.nf !== p.nfPrincipal ? c.nf : '') : this.custoNf;
    const selEnvio =
      r.envs.length && this.resp?.temNfCusto
        ? `<div class="campo inteiro"><label for="cf-nf">Envio</label><select id="cf-nf" ${this.salvandoCusto ? 'disabled' : ''}>${r.envs
            .filter((e) => !e.junto || e.nf === nfSel)
            .map((e) => `<option value="${e.idx ? esc(e.nf) : ''}" ${(e.idx ? e.nf : '') === nfSel ? 'selected' : ''}>${e.idx + 1}º envio · NF ${esc(e.nf)}</option>`)
            .join('')}</select></div>`
        : '';
    const transps = this.resp?.transportadoras || [];
    const tr = v.transportadora ? `${v.transportadora} - ${transps.find(([k]) => k === v.transportadora)?.[1] || v.transportadoraNome || ''}` : '';
    const ops = (o: Opcao[], sel: string, vazio = '') => `${vazio ? `<option value="">${esc(vazio)}</option>` : ''}${o.map(([k, t]) => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(t)}</option>`).join('')}`;
    const dis = this.salvandoCusto ? 'disabled' : '';
    const semCte = v.cte === SEM_CTE;
    return `<div class="cform" id="lg-cform">
      <div class="cform-tit">${c ? `Editando a cobrança ${esc(c.item)}` : 'Nova cobrança'}</div>
      <div class="cform-grade">
        ${selEnvio}
        <div class="campo"><label for="cf-tipo">Tipo</label><select id="cf-tipo" ${dis}>${ops(this.opCusto('tipoCusto'), v.tipo)}</select></div>
        <div class="campo"><label for="cf-cte">CTE / documento</label><input id="cf-cte" type="text" maxlength="20" value="${esc(semCte ? '' : v.cte)}" ${dis} ${semCte ? 'disabled' : ''}>
          <label class="check-sem-cte"><input type="checkbox" id="cf-semcte" ${semCte ? 'checked' : ''} ${dis}> Sem CTE</label></div>
        <div class="campo"><label for="cf-data">Data</label><div class="com-hoje"><input id="cf-data" type="date" value="${esc(v.data)}" ${dis}><button type="button" class="btn-txt" data-acao="cf-hoje" ${dis}>Hoje</button></div></div>
        <div class="campo inteiro"><label for="cf-transp">Transportadora</label><input id="cf-transp" list="lg-transps" value="${esc(tr)}" placeholder="Código ou nome" ${dis}></div>
        <div class="campo"><label for="cf-valor">Valor cobrado (R$)</label><input id="cf-valor" type="text" inputmode="decimal" value="${esc(numTxt(v.valor))}" ${dis}></div>
        <div class="campo"><label for="cf-situa">Situação</label><select id="cf-situa" ${dis}>${ops(this.opCusto('situacaoCusto'), v.situacao, 'OK (sem divergência)')}</select></div>
        <div class="campo"><label for="cf-esp">Valor esperado (R$)</label><input id="cf-esp" type="text" inputmode="decimal" value="${esc(numTxt(v.valorEsperado))}" placeholder="o combinado, se divergente" ${dis}></div>
        <p class="nota inteiro" id="cf-dica-sem" ${semCte ? '' : 'hidden'}>Sem CTE: com valor = frete pago sem CTE; valor zero = movimentação interna, sem cobrança. Conta como envio lançado.</p>
        <div class="campo inteiro"><label for="cf-obs">Observação</label><textarea id="cf-obs" rows="2" maxlength="250" placeholder="O que foi combinado, com quem e quando" ${dis}>${esc(v.obs)}</textarea></div>
        <div class="inteiro acoes-cform">
          ${c ? `<button type="button" class="btn-txt perigo" data-acao="custo-excluir" ${dis}>Excluir cobrança</button>` : ''}
          <span class="muted" id="cf-msg" aria-live="polite"></span>
          <button type="button" class="btn" data-acao="custo-cancelar" ${dis}>Cancelar</button>
          <button type="button" class="btn pri" data-acao="custo-salvar" ${dis}>${this.salvandoCusto ? 'Gravando…' : 'Salvar cobrança'}</button>
        </div>
      </div></div>`;
  }

  // ---------- Envios parciais (25/11/2026, pedido do usuario) ----------
  /** "1o" ou "NF 000123" da cobranca (a qual envio ela pertence) */
  private envioDaCobranca(r: Reg, c: Custo): string {
    const e = r.envs.find((x) => x.idx > 0 && x.nf === c.nf);
    return e ? `${e.idx + 1}º · NF ${e.nf}` : `1º · NF ${r.envs[0]?.nf || ''}`;
  }

  /** Bloco "Envios seguintes" da gaveta: um grupo por NF depois da 1a, que grava
   *  na hora (POST /logistica/envios), sem fechar a gaveta. A 1a NF usa os campos
   *  de "Envio e entrega" (SC5). CTE e frete: cobrancas com a NF do envio. */
  private enviosHtml(r: Reg): string {
    const resp = this.resp;
    const sem = !resp?.temEnvios;
    const transps = resp?.transportadoras || [];
    const nomeT = (k: string) => (k ? `${k} - ${transps.find(([c]) => c === k)?.[1] || ''}` : '');
    const ops = (o: Opcao[], sel: string) => `<option value="">(não informado)</option>${o.map(([c, t]) => `<option value="${esc(c)}" ${c === sel ? 'selected' : ''}>${esc(c)} - ${esc(t)}</option>`).join('')}${sel && !o.some(([c]) => c === sel) ? `<option value="${esc(sel)}" selected>${esc(sel)}</option>` : ''}`;
    const blocos = r.envs
      .filter((e) => e.idx > 0)
      .map((e) => {
        const k = e.idx;
        const id = (c: string) => `ev${k}-${c}`;
        // NF do mesmo dia da 1a, sem envio proprio: segue o 1o envio ate alguem registrar a parte
        if (e.junto && !this.separar.has(e.nf)) {
          return `<fieldset class="grupo-f grupo-envio" data-env="${k}"><legend>NF ${esc(e.nf)}${e.serie ? `/${esc(e.serie)}` : ''} · faturada ${fmt(e.dataFat) || '–'}</legend>
          <p class="nota inteiro">${n0(e.qtd)} un nesta NF. <b>Saiu junto com o 1º envio</b> (NF emitida no mesmo dia): usa as datas, o tipo de material e o indicador do 1º envio.</p>
          <div class="inteiro acoes-env"><button type="button" class="btn" data-acao="envio-separar" data-envnf="${esc(e.nf)}" ${sem ? 'disabled' : ''}>Não saiu junto: registrar envio separado</button></div>
        </fieldset>`;
        }
        const dis = sem || this.salvandoEnvio === k ? 'disabled' : '';
        const data = (c: string, rot: string, v: string, hoje = true) =>
          `<div class="campo"><label for="${id(c)}">${rot}</label><div class="com-hoje"><input id="${id(c)}" type="date" value="${esc(v)}" ${dis}>${hoje ? `<button type="button" class="btn-txt" data-acao="ev-hoje" data-alvo="${id(c)}" ${dis}>Hoje</button>` : ''}</div></div>`;
        const cobs = e.custos.length
          ? `${e.custos.map((c) => (c.cte === SEM_CTE ? 'Sem CTE' : c.cte ? `CTE ${esc(c.cte)}` : esc(this.txtCusto('tipoCusto', c.tipo)))).join(' · ')} · <b>${rs(e.custos.reduce((s, c) => s + (c.valor || 0), 0))}</b>`
          : '<span class="crit-txt">nenhuma cobrança deste envio</span>';
        return `<fieldset class="grupo-f grupo-envio" data-env="${k}"><legend>${k + 1}º envio · NF ${esc(e.nf)}${e.serie ? `/${esc(e.serie)}` : ''} · faturada ${fmt(e.dataFat) || '–'}</legend>
          <p class="nota inteiro">${n0(e.qtd)} un nesta NF${e.prazo ? ` · ${this.pillPrazo({ prazo: e.prazo, atraso: e.atraso } as Reg)}` : ''}</p>
          ${data('dataEnvio', 'Data de envio', e.dataEnvio)}
          ${data('dataPrevisao', 'Previsão de entrega (transportadora)', e.dataPrevisao, false)}
          ${data('dataEntrega', 'Data de entrega', e.entFinal)}
          <div class="campo"><label for="${id('tipoMaterial')}">Tipo de material</label><select id="${id('tipoMaterial')}" ${dis}>${ops(this.op('tipoMaterial'), e.tipoMaterial)}</select></div>
          <div class="campo"><label for="${id('indicador')}">Indicador de atraso</label><select id="${id('indicador')}" ${dis}>${ops(this.op('indicador'), e.indicador)}</select></div>
          <div class="campo"><label for="${id('transportadora')}">Transportadora deste envio</label><input id="${id('transportadora')}" list="lg-transps" value="${esc(nomeT(e.transportadora))}" placeholder="Código ou nome" ${dis}></div>
          <p class="inteiro env-cob"><b>CTE e frete:</b> ${cobs}${resp?.temCustos ? ` <button type="button" class="btn-txt" data-acao="custo-novo" data-envnf="${esc(e.nf)}" ${resp?.temNfCusto ? '' : 'disabled title="Falta o campo ZLC_NF: rodar o U_LOGRELUPD, opção Tabelas"'}>+ Cobrança deste envio</button>` : ''}</p>
          <div class="inteiro acoes-env"><span class="muted" id="${id('msg')}" aria-live="polite"></span><button type="button" class="btn pri" data-acao="envio-salvar" data-env="${k}" ${dis}>${this.salvandoEnvio === k ? 'Gravando…' : 'Salvar envio'}</button></div>
        </fieldset>`;
      })
      .join('');
    const aviso = sem ? '<p class="aviso">Tabela de envios (ZLE) ainda não criada neste ambiente: rodar o U_LOGRELUPD, opção Tabelas. Até lá, os envios seguintes só aparecem para consulta.</p>' : '';
    return `${aviso}<p class="nota">Pedido faturado em ${n0(r.envs.length)} NFs: cada NF é um envio. O 1º (NF ${esc(r.envs[0].nf)}) fica em "Envio e entrega"; os seguintes, abaixo, gravam com o botão de cada um.</p>${blocos}`;
  }

  private async salvarEnvio(k: number): Promise<void> {
    const r = this.reg(this.aberto);
    const e = r?.envs.find((x) => x.idx === k);
    if (!r || !e || this.salvandoEnvio >= 0) return;
    const q = <T extends HTMLElement>(c: string) => this.el.camada.querySelector(`#ev${k}-${c}`) as T | null;
    const val = (c: string) => (q<HTMLInputElement>(c)?.value || '').trim();
    const msg = (t: string, erro = true) => {
      const m = q<HTMLElement>('msg');
      if (m) {
        m.textContent = t;
        m.classList.toggle('crit-txt', erro);
      }
      if (erro) this.aviso(t, true);
    };
    const trTxt = val('transportadora');
    const tr = trTxt.includes(' - ') ? trTxt.split(' - ')[0].trim() : trTxt.toUpperCase();
    const novo: Record<string, string> = {
      dataEnvio: val('dataEnvio'),
      dataPrevisao: val('dataPrevisao'),
      dataEntrega: val('dataEntrega'),
      tipoMaterial: val('tipoMaterial'),
      indicador: val('indicador'),
      transportadora: tr,
    };
    if (novo['dataEnvio'] && e.dataFat && novo['dataEnvio'] < e.dataFat) return msg(`O envio (${fmt(novo['dataEnvio'])}) é anterior à emissão da NF (${fmt(e.dataFat)}).`);
    if (novo['dataEntrega'] && !novo['dataEnvio']) return msg('A entrega exige a data de envio.');
    if (novo['dataEntrega'] && novo['dataEntrega'] < novo['dataEnvio']) return msg(`A entrega (${fmt(novo['dataEntrega'])}) é anterior ao envio (${fmt(novo['dataEnvio'])}).`);
    if (tr && !(this.resp?.transportadoras || []).some(([c]) => c === tr)) return msg(`Transportadora "${tr}" não encontrada no cadastro (escolha na lista).`);
    const atual: Record<string, string> = { dataEnvio: e.dataEnvio, dataPrevisao: e.dataPrevisao, dataEntrega: e.entFinal, tipoMaterial: e.tipoMaterial, indicador: e.indicador, transportadora: e.transportadora };
    const corpo: EnvioEdicao = { recno: r.p.recno, nf: e.nf, serie: e.serie };
    const b = corpo as unknown as Record<string, string | number>;
    Object.keys(novo).forEach((c) => {
      if (novo[c] !== atual[c] || (e.junto && novo[c])) b[c] = novo[c];
    });
    if (Object.keys(b).length <= 3) return msg('Nada mudou neste envio.', false);
    this.salvandoEnvio = k;
    this.redesenharEnvios();
    try {
      const novoPed = await this.api.salvarEnvio(corpo);
      this.salvandoEnvio = -1;
      if (novoPed && novoPed.pedido) {
        const i = this.regs.findIndex((x) => x.p.recno === r.p.recno);
        if (i >= 0) this.regs[i] = this.montar(novoPed);
      }
      this.redesenharEnvios();
      this.redesenharCustos();
      this.desenhar();
      this.atualizarForm();
      if (this.hist) void this.carregarHist();
      this.aviso(`Envio da NF ${e.nf} gravado.`);
      if (novoPed?.avisoHistorico) this.aviso(novoPed.avisoHistorico, true);
    } catch (err) {
      this.salvandoEnvio = -1;
      this.redesenharEnvios();
      msg(`Não foi possível gravar o envio: ${this.api.mensagemErro(err)}`);
    }
  }

  private redesenharEnvios(): void {
    const r = this.reg(this.aberto);
    const box = this.el.camada.querySelector('#lg-envios');
    if (r && box) box.innerHTML = this.enviosHtml(r);
  }

  /** Redesenha so os blocos de custos e de frete (o formulario do pedido fica como esta) */
  private redesenharCustos(): void {
    const r = this.reg(this.aberto);
    if (!r) return;
    const box = this.el.camada.querySelector('#lg-custos');
    if (box) box.innerHTML = this.custosHtml(r);
    const env = this.el.camada.querySelector('#lg-envios');
    if (env) env.innerHTML = this.enviosHtml(r);
    const fr = this.el.camada.querySelector('#lg-frete');
    if (fr) fr.innerHTML = this.freteHtml(r);
  }

  private async salvarCusto(acao: 'incluir' | 'alterar' | 'excluir'): Promise<void> {
    const r = this.reg(this.aberto);
    if (!r || this.salvandoCusto) return;
    const q = <T extends HTMLElement>(id: string) => this.el.camada.querySelector('#' + id) as T | null;
    const msg = (t: string) => {
      const m = q<HTMLElement>('cf-msg');
      if (m) {
        m.textContent = t;
        m.classList.add('crit-txt');
      }
      this.aviso(t, true);
    };
    const corpo: CustoEdicao = { recno: r.p.recno, acao };
    if (acao !== 'incluir') corpo.item = this.custoEdit || '';
    if (acao === 'excluir') {
      const c = (r.p.custos || []).find((x) => x.item === corpo.item);
      if (!c) return;
      if (!confirm(`Excluir a cobrança ${c.item} (${this.txtCusto('tipoCusto', c.tipo)}${c.cte ? ` · CTE ${c.cte}` : ''} · ${rs(c.valor)})?\n\nA exclusão fica registrada no histórico do pedido.`)) return;
    } else {
      const valor = numBR(q<HTMLInputElement>('cf-valor')?.value || '');
      const esp = numBR(q<HTMLInputElement>('cf-esp')?.value || '');
      // "Sem CTE" (pedido do usuario, 24/11/2026): grava a marca SEM CTE no ZLC_CTE;
      // com valor = frete pago sem CTE, valor zero = movimentacao interna sem cobranca
      const semCte = !!q<HTMLInputElement>('cf-semcte')?.checked;
      const cte = semCte ? SEM_CTE : (q<HTMLInputElement>('cf-cte')?.value || '').trim().toUpperCase();
      const trTxt = (q<HTMLInputElement>('cf-transp')?.value || '').trim();
      const tr = trTxt.includes(' - ') ? trTxt.split(' - ')[0].trim() : trTxt.toUpperCase();
      const situ = q<HTMLSelectElement>('cf-situa')?.value || '';
      if (Number.isNaN(valor) || valor < 0) return msg('Valor cobrado inválido (use 1.234,56).');
      if (Number.isNaN(esp) || esp < 0) return msg('Valor esperado inválido (use 1.234,56).');
      if (!valor && !cte) return msg('Informe o valor, o número do CTE/documento ou marque "Sem CTE".');
      if (cte === SEM_CTE && !semCte) return msg('Para lançar sem CTE, marque a opção "Sem CTE".');
      if (tr && !(this.resp?.transportadoras || []).some(([k]) => k === tr)) return msg(`Transportadora "${tr}" não encontrada no cadastro (escolha na lista).`);
      Object.assign(corpo, {
        tipo: q<HTMLSelectElement>('cf-tipo')?.value || 'O',
        cte,
        data: q<HTMLInputElement>('cf-data')?.value || '',
        transportadora: tr,
        valor,
        valorEsperado: esp,
        situacao: situ,
        obs: (q<HTMLTextAreaElement>('cf-obs')?.value || '').replace(/\s*\r?\n\s*/g, ' ').trim(),
      });
      const selNf = q<HTMLSelectElement>('cf-nf');
      if (selNf) corpo.nf = selNf.value;
      if (acao === 'alterar') {
        // so o que mudou (o historico grava campo a campo)
        const c = (r.p.custos || []).find((x) => x.item === corpo.item);
        if (c) {
          const atual: Record<string, string | number> = { tipo: c.tipo, cte: c.cte, data: c.data, transportadora: c.transportadora, valor: c.valor, valorEsperado: c.valorEsperado, situacao: c.situacao, obs: c.obs, nf: c.nf && c.nf !== r.p.nfPrincipal ? c.nf : '' };
          const b = corpo as unknown as Record<string, string | number>;
          Object.keys(atual).forEach((k) => {
            const a = atual[k];
            if (typeof a === 'number' ? Math.abs(a - Number(b[k])) < 0.005 : String(a) === String(b[k])) delete b[k];
          });
          if (Object.keys(b).length <= 3) {
            this.custoEdit = null;
            this.redesenharCustos();
            return;
          }
        }
      }
    }
    this.salvandoCusto = true;
    this.redesenharCustos();
    try {
      const novo = await this.api.salvarCusto(corpo);
      this.salvandoCusto = false;
      if (novo && novo.pedido) {
        const i = this.regs.findIndex((x) => x.p.recno === r.p.recno);
        if (i >= 0) this.regs[i] = this.montar(novo);
      }
      this.custoEdit = null;
      this.custosAbertos = true;
      // historico mudou: le de novo se o bloco estiver aberto
      if (this.hist) void this.carregarHist();
      this.redesenharCustos();
      this.desenhar();
      // os avisos da gaveta ("Falta lançar o CTE"...) dependem das cobrancas: refaz
      this.atualizarForm();
      this.aviso(acao === 'excluir' ? 'Cobrança excluída.' : acao === 'incluir' ? 'Cobrança incluída.' : 'Cobrança salva.');
      if (novo?.avisoHistorico) this.aviso(novo.avisoHistorico, true);
    } catch (e) {
      this.salvandoCusto = false;
      this.redesenharCustos();
      msg(`Não foi possível gravar a cobrança: ${this.api.mensagemErro(e)}`);
    }
  }

  private async carregarHist(): Promise<void> {
    const r = this.reg(this.aberto);
    if (!r) return;
    const pedido = r.p.pedido;
    this.hist = { pedido, linhas: this.hist?.pedido === pedido ? this.hist.linhas : null, erro: '' };
    const corpo = () => this.el.camada.querySelector('#lg-hist-corpo');
    if (!this.hist.linhas) {
      const c = corpo();
      if (c) c.innerHTML = this.histHtml();
    }
    try {
      const linhas = await this.api.historico(pedido);
      if (this.hist?.pedido !== pedido) return;
      this.hist = { pedido, linhas, erro: '' };
    } catch (e) {
      if (this.hist?.pedido !== pedido) return;
      this.hist = { pedido, linhas: null, erro: this.api.mensagemErro(e) };
    }
    const c = corpo();
    if (c) c.innerHTML = this.histHtml();
  }

  private histHtml(): string {
    const h = this.hist;
    if (!h) return '<p class="muted">Abra para ver.</p>';
    if (h.erro) return `<p class="erro">Não foi possível ler o histórico: ${esc(h.erro)}</p>`;
    if (!h.linhas) return '<p class="muted">Carregando…</p>';
    if (!h.linhas.length) return '<p class="muted">Nenhuma alteração registrada ainda. O histórico começa a partir da criação da tabela (alterações feitas pela tela e pela importação).</p>';
    const campoSC5 = Object.fromEntries(Object.entries(CAMPO).map(([k, c]) => [c, k])) as Record<string, keyof PedidoEdicao>;
    const ORIGEM: Record<string, string> = { '2': 'Importação', '3': 'Carga inicial' };
    const val = (s: string) => (s ? esc(s) : '<span class="muted">(vazio)</span>');
    return `<ul class="hist">${h.linhas
      .map((l) => {
        const quem = `${fmt(l.data)} ${esc(l.hora.slice(0, 5))} · ${esc(l.usuario || l.codUsuario || '?')}${ORIGEM[l.origem] ? ` <span class="pill semprev">${ORIGEM[l.origem]}</span>` : ''}`;
        let o = '';
        if (l.item && l.campo === 'ZLC') o = l.acao === 'E' ? `<b>Cobrança ${esc(l.item)} excluída</b> · ${val(l.de)}` : `<b>Cobrança ${esc(l.item)} incluída</b> · ${val(l.para)}`;
        else {
          const rot = l.item ? `Cobrança ${esc(l.item)} · ${esc(ROTULO_CUSTO[l.campo] || l.titulo)}` : esc(campoSC5[l.campo] ? this.rotulo(campoSC5[l.campo]) : l.titulo || l.campo);
          o = `<b>${rot}</b>: ${val(l.de)} → ${val(l.para)}`;
        }
        return `<li><span class="h-quem">${quem}</span><span class="h-o">${o}</span></li>`;
      })
      .join('')}</ul>`;
  }


  /** Valores do formulario no formato do PUT */
  private lerForm(): PedidoEdicao {
    const f = this.el.camada.querySelector('#lg-form') as HTMLFormElement | null;
    const out: Record<string, string | number> = {};
    if (!f) return out;
    f.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-f]').forEach((el) => {
      const k = el.dataset['f'] as keyof PedidoEdicao;
      if (el instanceof HTMLInputElement && el.type === 'radio') {
        if (el.checked) out[k] = el.value;
        return;
      }
      if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        out[k] = el.checked ? 'S' : '';
        return;
      }
      if (k === 'transportadora') {
        const v = el.value.trim();
        out[k] = v.includes(' - ') ? v.split(' - ')[0].trim() : v.toUpperCase();
        return;
      }
      if (NUMEROS.includes(k)) {
        out[k] = numBR(el.value);
        return;
      }
      if (k === 'pedidoReenvio' || k === 'pedidoFinal') {
        out[k] = numPedido(el.value);
        return;
      }
      if (k === 'especie') {
        out[k] = el.value.trim().toUpperCase();
        return;
      }
      if (OBS.includes(k)) {
        // campo caracter (tem tamanho): uma linha so; memo: mantem as quebras
        const txt = el.value.replace(/\r\n?/g, '\n').trim();
        out[k] = this.resp?.tamanhos?.[CAMPO[k]] ? txt.replace(/\s*\n\s*/g, ' ') : txt;
        return;
      }
      out[k] = el.value.trim();
    });
    return out as PedidoEdicao;
  }

  /** So o que mudou em relacao ao pedido gravado */
  private alteracoes(p: Pedido, valores?: Record<string, string | number>): PedidoEdicao {
    const f = valores ?? (this.lerForm() as Record<string, string | number>);
    const atual = this.atuais(p);
    const out: Record<string, string | number> = {};
    Object.keys(f).forEach((k) => {
      if (this.faltando.has(CAMPO[k as keyof PedidoEdicao])) return;
      const a = atual[k] ?? '';
      const v = f[k];
      if (typeof a === 'number' ? Math.abs(a - Number(v)) > 0.0001 : String(a) !== String(v)) out[k] = v;
    });
    // Reentrega desmarcada: limpa os dados da reentrega junto
    if (f['reentrega'] === 'N') {
      REENTREGA.forEach((k) => {
        if (this.faltando.has(CAMPO[k])) return;
        // com a tabela de custos o CTE da reentrega e uma cobranca: nao limpa por aqui
        if (this.temCustos && k !== 'dataNovaEntrega') return;
        const a = atual[k];
        if (a && a !== 0) out[k] = NUMEROS.includes(k) ? 0 : '';
        else delete out[k];
      });
    }
    // Data do retorno apagada: limpa motivo e pedido do reenvio junto
    if (f['dataRetorno'] === '' && atual['dataRetorno']) {
      RETORNO.forEach((k) => {
        if (this.faltando.has(CAMPO[k])) return;
        if (atual[k]) out[k] = '';
        else delete out[k];
      });
    }
    // Finalizacao sem entrega (24/11/2026): desmarcada limpa todos os dados dela;
    // reembolso so no extravio; data do reembolso so com Reembolsado
    const limpar = (ks: (keyof PedidoEdicao)[]) =>
      ks.forEach((k) => {
        if (this.faltando.has(CAMPO[k])) return;
        const a = atual[k];
        if (a && a !== 0) out[k] = NUMEROS.includes(k) ? 0 : '';
        else delete out[k];
      });
    // (so quando o formulario traz a caixa: a importacao nao mexe nisso)
    if ('finalizado' in f) {
      if (f['finalizado'] !== 'S') limpar(FINAL);
      else if (f['motivoFinal'] !== 'E') limpar(REEMBOLSO);
      else if (f['reembolso'] !== 'S') limpar(['dataReembolso']);
    }
    // descricao so com o indicador "Outros"
    if ('indicador' in f && !this.indOutros(String(f['indicador'] || ''))) limpar(['obsIndicador']);
    // Pedido com NF: os comerciais ficam como estao (o campo esta desligado)
    if ((p.notas || []).length) COMERCIAIS.forEach((k) => delete out[k]);
    return out as PedidoEdicao;
  }

  /** Valores gravados do pedido no formato do formulario (reentrega S/N) */
  private atuais(p: Pedido): Record<string, string | number> {
    return {
      previsaoSaida: p.previsaoSaida,
      dataEnvio: p.dataEnvio,
      dataPrevisao: p.dataPrevisao,
      dataEntrega: p.dataEntrega,
      tipoMaterial: p.tipoMaterial,
      cte: p.cte,
      valorCte: p.valorCte || 0,
      reentrega: p.reentrega === 'SIM' ? 'S' : 'N',
      cteReentrega: p.cteReentrega,
      valorCteReentrega: p.valorCteReentrega || 0,
      dataNovaEntrega: p.dataNovaEntrega,
      indicador: p.indicador,
      dataRetorno: p.dataRetorno || '',
      motivoRetorno: p.motivoRetorno || '',
      pedidoReenvio: p.pedidoReenvio || '',
      transportadora: p.transportadora,
      frete: p.frete || 0,
      volume: p.volume || 0,
      freteNaoDestacado: p.freteNaoDestacado || 0,
      especie: p.especie || '',
      pesoLiquido: p.pesoLiquido || 0,
      pesoBruto: p.pesoBruto || 0,
      tipoFrete: p.tipoFrete || '',
      obsEntrega: (p.obsEntrega || '').replace(/\r\n?/g, '\n').trim(),
      obsRetorno: (p.obsRetorno || '').replace(/\r\n?/g, '\n').trim(),
      finalizado: p.finalizado === 'S' ? 'S' : '',
      motivoFinal: p.motivoFinal || '',
      dataFinal: p.dataFinal || '',
      pedidoFinal: p.pedidoFinal || '',
      reembolso: p.reembolso || '',
      valorReembolso: p.valorReembolso || 0,
      dataReembolso: p.dataReembolso || '',
      obsFinal: (p.obsFinal || '').replace(/\r\n?/g, '\n').trim(),
      obsIndicador: (p.obsIndicador || '').replace(/\r\n?/g, '\n').trim(),
    };
  }

  /** Liga/desliga a reentrega, confere as regras e mostra o que mudou */
  private atualizarForm(): void {
    const r = this.reg(this.aberto);
    const f = this.el.camada.querySelector('#lg-form');
    if (!r || !f) return;
    const v = this.lerForm();
    const sim = v.reentrega === 'S';
    REENTREGA.forEach((k) => {
      const el = f.querySelector<HTMLInputElement>(`[data-f="${k}"]`);
      if (el) el.disabled = !sim || this.faltando.has(CAMPO[k]);
      const h = f.querySelector<HTMLButtonElement>(`[data-hoje="${k}"]`);
      if (h) h.disabled = !sim || this.faltando.has(CAMPO[k]);
    });
    // Finalizar sem entrega: campos so com a caixa marcada; reembolso so no
    // extravio; data do reembolso so com Reembolsado (24/11/2026)
    const fin = v.finalizado === 'S';
    const liga = (k: keyof PedidoEdicao, on: boolean) => {
      const off = !on || this.faltando.has(CAMPO[k]);
      const el = f.querySelector<HTMLInputElement>(`[data-f="${k}"]`);
      if (el) el.disabled = off;
      const h = f.querySelector<HTMLButtonElement>(`[data-hoje="${k}"]`);
      if (h) h.disabled = off;
    };
    ['motivoFinal', 'dataFinal', 'pedidoFinal', 'obsFinal'].forEach((k) => liga(k as keyof PedidoEdicao, fin));
    liga('reembolso', fin && v.motivoFinal === 'E');
    liga('valorReembolso', fin && v.motivoFinal === 'E');
    liga('dataReembolso', fin && v.motivoFinal === 'E' && v.reembolso === 'S');
    const obsInd = f.querySelector<HTMLElement>('#lg-obsind');
    if (obsInd) obsInd.hidden = !this.indOutros(v.indicador);
    const { erros, avisos } = this.conferir(r.p, v);
    const ul = this.el.camada.querySelector('#lg-avisos') as HTMLElement;
    ul.innerHTML = [...erros.map((t) => `<li class="erro">${esc(t)}</li>`), ...avisos.map((t) => `<li>${esc(t)}</li>`)].join('');
    const mud = Object.keys(this.alteracoes(r.p)).length;
    const sujo = this.el.camada.querySelector('#lg-sujo') as HTMLElement;
    sujo.textContent = mud ? `${mud} campo${mud > 1 ? 's' : ''} alterado${mud > 1 ? 's' : ''}` : 'Sem alterações';
    const btn = this.el.camada.querySelector('#lg-salvar') as HTMLButtonElement;
    btn.disabled = this.salvando || !mud || erros.length > 0;
  }

  /** Mesmas regras do PUT (erros) + lembretes (avisos) */
  private conferir(p: Pedido, v: PedidoEdicao): { erros: string[]; avisos: string[] } {
    const erros: string[] = [];
    const avisos: string[] = [];
    const env = v.dataEnvio || '';
    const ent = v.dataEntrega || '';
    const prev = v.dataPrevisao || '';
    const nova = v.reentrega === 'S' ? v.dataNovaEntrega || '' : '';
    NUMEROS.forEach((k) => {
      const n = v[k] as number;
      if (Number.isNaN(n)) erros.push(`Valor inválido em ${this.rotulo(k)} (use 1.234,56).`);
      else if (n < 0) erros.push(`${this.rotulo(k)} não pode ser negativo.`);
    });
    if (env && env < p.emissao) erros.push(`O envio (${fmt(env)}) é anterior à emissão do pedido (${fmt(p.emissao)}).`);
    if (ent && !env) erros.push('Informe a data de envio antes da data de entrega.');
    if (ent && env && ent < env) erros.push(`A entrega (${fmt(ent)}) é anterior ao envio (${fmt(env)}).`);
    if (v.reentrega === 'S' && !env && p.reentrega !== 'SIM') erros.push('Reentrega só para pedido enviado: informe a data de envio.');
    if (nova && env && nova < env) erros.push(`A nova entrega (${fmt(nova)}) é anterior ao envio (${fmt(env)}).`);
    const ret = v.dataRetorno || '';
    if (ret && !env) erros.push('Retorno só para pedido enviado: informe a data de envio.');
    if (ret && env && ret < env) erros.push(`O retorno (${fmt(ret)}) é anterior ao envio (${fmt(env)}).`);
    if (!ret && RETORNO.some((k) => v[k])) erros.push('Motivo, pedido do reenvio e observação do retorno só com a data do retorno.');
    if (v.pedidoReenvio && v.pedidoReenvio === p.pedido) erros.push('O pedido do reenvio tem que ser outro pedido.');
    if (ret && !v.pedidoReenvio) avisos.push('Sem o pedido do reenvio: fica em Retornados como "aguardando reenvio".');
    // Finalizado sem entrega (mesmas regras da API 2026-11-24b)
    if (v.finalizado === 'S') {
      const mot = v.motivoFinal || '';
      const dfim = v.dataFinal || '';
      const entF = v.reentrega === 'S' ? nova : ent;
      if (!mot) erros.push('Finalizado sem entrega: escolha o motivo.');
      if (!dfim) erros.push(mot === 'E' ? 'Informe a data do extravio.' : 'Informe a data da finalização.');
      if (dfim && dfim < p.emissao) erros.push(`A data da finalização (${fmt(dfim)}) é anterior à emissão do pedido (${fmt(p.emissao)}).`);
      if (ret) erros.push('Pedido com data do retorno já está encerrado em Retornados: apague o retorno para finalizar sem entrega.');
      if (entF) erros.push('Pedido com data de entrega já está encerrado: apague a data de entrega para finalizar sem entrega.');
      if (mot === 'E' && !env) erros.push('Extravio só para pedido enviado: informe a data de envio.');
      if (mot === 'E' && env && dfim && dfim < env) erros.push(`O extravio (${fmt(dfim)}) é anterior ao envio (${fmt(env)}).`);
      if (mot === 'P' && !v.pedidoFinal) erros.push('Informe o pedido em que a mercadoria foi enviada.');
      if (v.pedidoFinal && v.pedidoFinal === p.pedido) erros.push('O pedido em que a mercadoria foi tem que ser outro pedido.');
      if (mot === 'O' && !(v.obsFinal || '').trim()) erros.push('Outro motivo: descreva na observação o que aconteceu.');
      if (mot === 'E' && v.reembolso === 'S' && v.dataReembolso && dfim && v.dataReembolso < dfim) erros.push(`O reembolso (${fmt(v.dataReembolso)}) é anterior ao extravio (${fmt(dfim)}).`);
      if (mot === 'E' && v.reembolso !== 'S' && v.reembolso !== 'N') avisos.push('Extravio com reembolso pendente: o pedido aparece no cartão "Reembolsos pendentes" até o reembolso ser resolvido.');
      if (mot === 'E' && v.reembolso === 'S' && !v.valorReembolso) avisos.push('Reembolsado: informe o valor do reembolso.');
    }
    if (this.indOutros(v.indicador) && !(v.obsIndicador || '').trim() && !this.faltando.has(CAMPO.obsIndicador)) erros.push('Indicador "Outros": descreva o que aconteceu.');
    const tr = v.transportadora || '';
    if (tr && !(p.notas || []).length && !(this.resp?.transportadoras || []).some(([c]) => c === tr)) erros.push(`Transportadora "${tr}" não encontrada no cadastro (escolha na lista).`);
    if (env && !(p.notas || []).length) avisos.push('Pedido sem nota fiscal com data de envio preenchida.');
    if (env && !prev) avisos.push('Falta a previsão de entrega da transportadora: sem ela o pedido não entra no indicador de prazo.');
    const final = v.reentrega === 'S' ? nova : ent;
    if (final && prev && final > prev && !v.indicador) avisos.push('Entrega depois da previsão: escolha o indicador de atraso.');
    if (!final && !ret && prev && prev < iso(this.hoje) && env && !v.indicador) avisos.push('Previsão vencida e sem entrega: escolha o indicador de atraso.');
    if (v.reentrega === 'S' && !nova) avisos.push('Reentrega sem a nova data de entrega: o pedido continua em Enviados até ela ser informada.');
    if (this.temCustos) {
      if (env && !(p.custos || []).length) avisos.push('Falta lançar o CTE em Custos de frete (ou marcar "Sem CTE" para movimentação interna ou frete sem CTE).');
    } else if (env && !v.cte) avisos.push('Falta o número do CTE.');
    const sai = v.previsaoSaida || '';
    if (sai && !env && sai < iso(this.hoje)) avisos.push(`A saída programada (${fmt(sai)}) passou e o pedido não saiu: informe a data de envio ou reprograme.`);
    if (!(p.notas || []).length) {
      const nfe = PARA_NFE.filter((k) => !this.faltando.has(CAMPO[k]) && !v[k]);
      if (nfe.length) avisos.push(`Antes da emissão da NF-e, preencha: ${nfe.map((k) => this.rotulo(k).toLowerCase()).join(', ')}.`);
      if (v.pesoLiquido && v.pesoBruto && v.pesoBruto < v.pesoLiquido) avisos.push('O peso bruto está menor que o peso líquido.');
    }
    return { erros, avisos };
  }

  /** Pedido sem NF com espécie, peso líquido ou peso bruto vazio (campos que existem) */
  private faltaNfe(p: Pedido): (keyof PedidoEdicao)[] {
    if ((p.notas || []).length) return [];
    return PARA_NFE.filter((k) => !this.faltando.has(CAMPO[k]) && !p[k as 'especie' | 'pesoLiquido' | 'pesoBruto']);
  }

  private rotulo(k: keyof PedidoEdicao): string {
    return ROTULO[k] || k;
  }

  private async salvar(): Promise<void> {
    const r = this.reg(this.aberto);
    if (!r || this.salvando) return;
    const dados = this.alteracoes(r.p);
    if (!Object.keys(dados).length) return;
    const { erros } = this.conferir(r.p, this.lerForm());
    if (erros.length) {
      this.aviso(erros[0], true);
      return;
    }
    this.salvando = true;
    this.atualizarForm();
    const btn = this.el.camada.querySelector('#lg-salvar') as HTMLButtonElement | null;
    if (btn) btn.textContent = 'Salvando…';
    try {
      const novo = await this.api.salvar(r.p.recno, dados);
      this.salvando = false;
      if (novo && novo.pedido) {
        const i = this.regs.findIndex((x) => x.p.recno === r.p.recno);
        if (i >= 0) this.regs[i] = this.montar(novo);
        this.aviso(`Pedido ${novo.pedido} salvo.`);
        // salvou: fecha os detalhes do pedido (pedido do usuario, 13/11/2026)
        this.fecharCamada();
        this.desenhar();
      } else {
        this.aviso('Pedido salvo. Atualizando a lista…');
        this.fecharCamada();
        this.api.carregar(iso(this.e.de), iso(this.e.ate));
      }
    } catch (e) {
      this.salvando = false;
      if (btn) btn.textContent = 'Salvar';
      this.atualizarForm();
      this.aviso(`Não foi possível salvar: ${this.api.mensagemErro(e)}`, true);
    }
  }


  private limparFiltros(): void {
    MULTI.forEach(([k]) => (this.e[k] = []));
    this.e.busca = '';
    this.e.fDe = '';
    this.e.fAte = '';
    (this.raiz.querySelector('#lg-busca') as HTMLInputElement).value = '';
    (this.raiz.querySelector('#lg-fde') as HTMLInputElement).value = '';
    (this.raiz.querySelector('#lg-fate') as HTMLInputElement).value = '';
    this.raiz.querySelector('#lg-fde')?.closest('.campo')?.classList.remove('ativo');
    MULTI.forEach(([k]) => this.desenharMulti(k));
    this.e.limite = 200;
    this.desenhar();
  }

  // ---------- camada, avisos, diagnostico ----------
  private fecharCamada(): void {
    if (this.salvando || this.salvandoCusto) return;
    this.el.camada.innerHTML = '';
    this.aberto = 0;
    this.custoEdit = null;
    this.hist = null;
  }
  private fecharComConfirmacao(): void {
    const r = this.reg(this.aberto);
    if (r && Object.keys(this.alteracoes(r.p)).length && !confirm('Há alterações não salvas neste pedido. Fechar mesmo assim?')) return;
    if (this.custoEdit !== null && !confirm('Há uma cobrança de frete aberta e não salva. Fechar mesmo assim?')) return;
    this.fecharCamada();
  }
  aviso(texto: string, erro = false): void {
    this.raiz.querySelectorAll('.toast').forEach((t) => t.remove());
    const t = document.createElement('div');
    t.className = 'toast' + (erro ? ' erro' : '');
    t.setAttribute('role', 'status');
    t.textContent = texto;
    this.raiz.appendChild(t);
    clearTimeout(this.tAviso);
    this.tAviso = window.setTimeout(() => t.remove(), erro ? 9000 : 5000);
  }
  private abrirDiagnostico(): void {
    void this.api.diagnostico().then((texto) => {
      this.el.camada.insertAdjacentHTML(
        'beforeend',
        `<div class="fundo fundo-modal" data-acao="fechar-modal"></div><div class="modal largo" role="dialog" aria-modal="true" aria-label="Diagnóstico"><header><h2>Diagnóstico</h2></header><div class="corpo"><pre class="diag inteiro">${esc(texto)}</pre></div><footer><button type="button" class="btn" data-acao="fechar-modal">Fechar</button></footer></div>`,
      );
    });
  }
  private fecharModal(): void {
    if (this.imp?.etapa === 'gravando') return;
    this.imp = null;
    this.xl = null;
    this.el.camada.querySelectorAll('.modal, .fundo-modal').forEach((x) => x.remove());
  }

  private irPara(tela: string): void {
    this.tela = tela;
    guardar('tela', tela);
    this.e.ord = { k: '', asc: false };
    this.e.limite = 200;
    this.desenhar();
  }

  /** Atualizar dados. O periodo saiu da tela em 23/11/2026 (pedido do usuario):
   *  pedidos com NF emitidos de 01/01 do ano anterior ate hoje; sem NF, todos */
  private consultar(): void {
    const ate = new Date();
    ate.setHours(0, 0, 0, 0);
    this.e.ate = ate;
    this.api.carregar(iso(this.e.de), iso(ate));
  }

  // ---------- Importacao por planilha ----------
  // Mesma gravacao da gaveta (PUT por pedido, um de cada vez), com as mesmas
  // regras: a planilha so muda o que tem valor (por padrao) e nada e gravado
  // antes da previa e da confirmacao.
  private abrirImportar(): void {
    if (!this.regs.length) {
      this.aviso('Consulte os pedidos antes de importar.', true);
      return;
    }
    this.imp = { etapa: 'colar', texto: '', cab: [], linhas: [], mapa: [], vazioMantem: true, previa: [], feitos: 0, ver: 'todos', extras: new Map(), buscando: false };
    this.desenharImp();
  }

  private async acaoImp(a: string): Promise<void> {
    const imp = this.imp;
    if (!imp) return;
    if (a === 'imp-modelo') {
      baixar('modelo-atualizacao-pedidos.csv', DESTINOS_IMP.filter(([d]) => d).map(([, t]) => celulaCsv(t)).join(';') + '\r\n');
      return;
    }
    if (a === 'imp-baixar') {
      this.baixarImp();
      return;
    }
    if (a === 'imp-voltar') {
      imp.etapa = imp.etapa === 'previa' ? 'mapa' : 'colar';
    } else if (a === 'imp-ler') {
      const tab = lerTabela(imp.texto);
      if (tab.length < 2) {
        this.aviso('Cole a linha de títulos e pelo menos uma linha de pedido.', true);
        return;
      }
      imp.cab = tab[0];
      imp.linhas = tab.slice(1);
      imp.mapa = autoMapa(imp.cab);
      imp.etapa = 'mapa';
    } else if (a === 'imp-previa') {
      if (!imp.mapa.includes('pedido')) {
        this.aviso('Escolha qual coluna é o Pedido.', true);
        return;
      }
      const rep = imp.mapa.find((d, i) => d && imp.mapa.indexOf(d) !== i);
      if (rep) {
        this.aviso(`"${DESTINOS_IMP.find(([d]) => d === rep)?.[1]}" está em mais de uma coluna.`, true);
        return;
      }
      if (!imp.mapa.some((d) => d && d !== 'pedido')) {
        this.aviso('Nenhuma coluna para gravar: escolha o campo de pelo menos uma coluna.', true);
        return;
      }
      if (imp.buscando) return;
      // A planilha pode trazer qualquer pedido: o que nao veio na consulta e
      // buscado pelo numero, sem filtro de periodo, TES ou tipo
      const iPed = imp.mapa.indexOf('pedido');
      const naTela = new Set(this.regs.map((r) => r.p.pedido));
      const faltam = [...new Set(imp.linhas.map((c) => numPedido(c[iPed] || '')).filter((n) => n && !naTela.has(n) && !imp.extras.has(n)))];
      if (faltam.length) {
        imp.buscando = true;
        this.aviso(`Buscando ${n0(faltam.length)} pedido${faltam.length > 1 ? 's' : ''} que não estão na consulta…`);
        try {
          for (let i = 0; i < faltam.length; i += 400) {
            (await this.api.buscarPedidos(faltam.slice(i, i + 400))).forEach((p) => imp.extras.set(p.pedido, p));
          }
        } catch (e) {
          this.aviso(`Não foi possível buscar os pedidos fora da consulta (${this.api.mensagemErro(e)}). Eles ficam como "fora da consulta"; compile o RESTLOGREL 2026-11-13c.`, true);
        } finally {
          imp.buscando = false;
        }
      }
      this.montarPrevia();
      imp.ver = imp.previa.some((l) => l.st === 'erro') ? 'erro' : 'todos';
      imp.etapa = 'previa';
    } else if (a === 'imp-gravar') {
      await this.gravarImp();
      return;
    }
    this.desenharImp();
  }

  private montarPrevia(): void {
    const imp = this.imp as Imp;
    const iPed = imp.mapa.indexOf('pedido');
    const vistos = new Map<string, number>();
    const ops = { tipoMaterial: this.op('tipoMaterial'), indicador: this.op('indicador') };
    const tam = this.resp?.tamanhos || {};
    imp.previa = imp.linhas.map((cel, idx) => {
      const L: ImpLinha = { n: idx + 2, pedido: numPedido(cel[iPed] || ''), recno: 0, dados: {}, mudancas: [], erros: [], avisos: [], st: 'erro' };
      if (!L.pedido) {
        L.erros.push('Sem número do pedido.');
        return L;
      }
      if (vistos.has(L.pedido)) {
        L.erros.push(`Pedido repetido na planilha (já está na linha ${vistos.get(L.pedido)}).`);
        return L;
      }
      vistos.set(L.pedido, L.n);
      // da consulta ou buscado pelo numero (qualquer pedido do Protheus)
      const ped = this.regs.find((x) => x.p.pedido === L.pedido)?.p || imp.extras.get(L.pedido);
      if (!ped) {
        L.erros.push('Pedido não encontrado no Protheus: confira o número.');
        return L;
      }
      const r = { p: ped };
      L.recno = r.p.recno;
      const base = this.atuais(r.p);
      const f: Record<string, string | number> = { ...base };
      let reeDados = false;
      imp.mapa.forEach((d, j) => {
        if (!d || d === 'pedido') return;
        const k = d;
        let bruto = (cel[j] ?? '').trim();
        if (bruto && semValor(bruto)) {
          L.avisos.push(`${ROTULO[k]}: "${bruto}" lido como vazio.`);
          bruto = '';
        }
        if (!bruto && imp.vazioMantem) return;
        if (this.faltando.has(CAMPO[k])) {
          L.erros.push(`${ROTULO[k]}: o campo ${CAMPO[k]} ainda não existe neste ambiente.`);
          return;
        }
        let v: string | number | null;
        if (k.startsWith('data')) v = dataIso(bruto);
        else if (NUMEROS.includes(k)) {
          const x = numBR(bruto);
          v = Number.isNaN(x) ? null : x;
        } else if (k === 'tipoMaterial' || k === 'indicador') v = opcaoDe(ops[k], bruto);
        else if (k === 'reentrega') v = simNao(bruto);
        else {
          // CTE: o Excel transforma numero grande em 1,23E+11 e perde digitos
          if (/^\d+([.,]\d+)?e\+\d+$/i.test(bruto)) {
            L.erros.push(`${ROTULO[k]} em notação científica ("${bruto}"): formate a coluna como texto no Excel.`);
            return;
          }
          const lim = tam[CAMPO[k]];
          if (lim && bruto.length > lim) {
            L.erros.push(`${ROTULO[k]} com mais de ${lim} caracteres.`);
            return;
          }
          v = bruto;
        }
        // Combo sem a opcao: so esse campo fica de fora (o resto da linha grava)
        if (v === null && (k === 'tipoMaterial' || k === 'indicador')) {
          L.avisos.push(`${ROTULO[k]}: "${bruto}" não existe no combo do ${CAMPO[k]} (${ops[k].map(([, t]) => t).join(', ')}). Campo não alterado.`);
          return;
        }
        if (v === null) {
          L.erros.push(`${ROTULO[k]}: valor não reconhecido ("${bruto}").`);
          return;
        }
        f[k] = v;
        if (REENTREGA.includes(k) && v) reeDados = true;
      });
      // Dados de reentrega sem "Gerou reentrega" na planilha: marca Sim; com "Nao" explicito: erro
      if (reeDados && f['reentrega'] !== 'S') {
        if (imp.mapa.includes('reentrega') && (cel[imp.mapa.indexOf('reentrega')] ?? '').trim()) L.erros.push('A planilha traz dados de reentrega, mas "Gerou reentrega" não é Sim.');
        else {
          f['reentrega'] = 'S';
          L.avisos.push('"Gerou reentrega" marcado como Sim (a planilha trouxe dados de reentrega).');
        }
      }
      // Reentrega sem a nova data: a planilha so tem uma data de entrega, que e a
      // final -> nova data = data de entrega e o pedido vai para Entregues (pedido do usuario, 13/11/2026)
      if (f['reentrega'] === 'S' && !f['dataNovaEntrega'] && f['dataEntrega'] && !this.faltando.has(CAMPO.dataNovaEntrega)) {
        f['dataNovaEntrega'] = f['dataEntrega'];
        L.avisos.push('Nova data de entrega = data de entrega (reentrega sem nova data).');
      }
      if (!L.erros.length) L.erros.push(...this.conferir(r.p, f as PedidoEdicao).erros);
      L.dados = this.alteracoes(r.p, f);
      L.mudancas = Object.entries(L.dados).map(([k, v]) => `${ROTULO[k]}: ${this.fmtCampo(k, base[k])} → ${this.fmtCampo(k, v)}`);
      L.st = L.erros.length ? 'erro' : L.mudancas.length ? 'ok' : 'igual';
      return L;
    });
  }

  private fmtCampo(k: string, v: unknown): string {
    if (v === '' || v === undefined || v === null) return '(vazio)';
    if (k.startsWith('data')) return fmt(String(v));
    if (k === 'volume') return v ? n0(Number(v)) : '(vazio)';
    if (k === 'pesoLiquido' || k === 'pesoBruto') return v ? pesoTxt(Number(v)) : '(vazio)';
    if (NUMEROS.includes(k as keyof PedidoEdicao)) return v ? rs(Number(v)) : '(vazio)';
    if (k === 'tipoMaterial' || k === 'indicador') return this.txtOp(k, String(v));
    if (k === 'reentrega') return v === 'S' ? 'Sim' : 'Não';
    if (k === 'transportadora') {
      const t = (this.resp?.transportadoras || []).find(([c]) => c === v);
      return t ? `${t[0]} - ${t[1]}` : String(v);
    }
    return String(v);
  }

  private async gravarImp(): Promise<void> {
    const imp = this.imp;
    if (!imp || this.salvando) return;
    const fila = imp.previa.filter((l) => l.st === 'ok');
    if (!fila.length) return;
    if (!confirm(`Gravar ${fila.length} pedido${fila.length > 1 ? 's' : ''} no Protheus?`)) return;
    imp.etapa = 'gravando';
    imp.feitos = 0;
    this.salvando = true;
    this.desenharImp();
    for (const L of fila) {
      try {
        const novo = await this.api.salvar(L.recno, L.dados, 'importacao');
        L.res = 'ok';
        if (novo && novo.pedido) {
          const i = this.regs.findIndex((x) => x.p.recno === L.recno);
          // pedido que nao estava na consulta (buscado pelo numero) passa a aparecer
          if (i >= 0) this.regs[i] = this.montar(novo);
          else this.regs.push(this.montar(novo));
          imp.extras.delete(novo.pedido);
        }
      } catch (e) {
        L.res = 'falha';
        L.msg = this.api.mensagemErro(e);
      }
      imp.feitos++;
      this.desenharImp();
    }
    this.salvando = false;
    imp.etapa = 'fim';
    imp.ver = fila.some((l) => l.res === 'falha') ? 'erro' : 'todos';
    this.desenhar();
    this.desenharImp();
  }

  private baixarImp(): void {
    const imp = this.imp;
    if (!imp) return;
    const sit = (l: ImpLinha) => (l.res === 'ok' ? 'Gravado' : l.res === 'falha' ? 'Falhou' : l.st === 'ok' ? 'A gravar' : l.st === 'igual' ? 'Sem alteração' : 'Com erro');
    const linhas = imp.previa.map((l) => [l.n, l.pedido, sit(l), l.mudancas.join(' | '), [...l.erros, ...(l.msg ? [l.msg] : [])].join(' | '), l.avisos.join(' | ')].map(celulaCsv).join(';'));
    baixar(`importacao-pedidos-${iso(this.hoje)}.csv`, ['Linha;Pedido;Situação;Alterações;Problemas;Avisos', ...linhas].join('\r\n'));
  }

  private desenharImp(): void {
    const imp = this.imp;
    this.el.camada.querySelectorAll('.modal, .fundo-modal').forEach((x) => x.remove());
    if (!imp) return;
    let corpo = '';
    let rodape = '';
    let sub = 'Cole as linhas do Excel ou escolha um CSV. Nada é gravado antes da sua confirmação.';
    if (imp.etapa === 'colar') {
      corpo = `<div class="pilha">
        <label class="campo"><span class="rot-imp">Linhas da planilha (com a linha de títulos)</span>
        <textarea id="imp-texto" class="imp-texto" spellcheck="false" placeholder="Selecione as células no Excel (com os títulos), copie e cole aqui.">${esc(imp.texto)}</textarea></label>
        <div class="acoes"><label class="btn">Escolher arquivo CSV<input type="file" accept=".csv,.txt" data-imp-arq hidden></label>
          <button type="button" class="btn-txt" data-acao="imp-modelo">Baixar modelo de planilha</button></div>
        <p class="nota">Colunas reconhecidas pelo título: ${DESTINOS_IMP.filter(([d]) => d)
          .map(([, t]) => esc(t))
          .join(', ')}. As demais colunas são ignoradas. A coluna Pedido é obrigatória (zeros à esquerda podem faltar). Datas em dd/mm/aaaa, valores em 1.234,56; tipo de material e indicador pelo código ou pela descrição.</p></div>`;
      rodape = `<button type="button" class="btn" data-acao="fechar-modal">Cancelar</button><button type="button" class="btn pri" data-acao="imp-ler">Continuar</button>`;
    } else if (imp.etapa === 'mapa') {
      sub = `${n0(imp.linhas.length)} linhas lidas. Confira o campo de cada coluna.`;
      const ops = (atual: Destino) =>
        DESTINOS_IMP.map(([d, t]) => `<option value="${d}" ${d === atual ? 'selected' : ''}>${esc(t)}${d && d !== 'pedido' && this.faltando.has(CAMPO[d]) ? ' (não existe neste ambiente)' : ''}</option>`).join('');
      corpo = `<div class="pilha"><div class="tabela-wrap"><table class="imp-tab"><thead><tr><th>Coluna da planilha</th><th>Exemplo (1ª linha)</th><th>Campo do pedido</th></tr></thead><tbody>${imp.cab
        .map((c, i) => `<tr class="sem-clique"><td><b>${esc(c || `(coluna ${i + 1})`)}</b></td><td class="muted">${esc(imp.linhas[0]?.[i] ?? '')}</td><td><select data-imp-col="${i}" aria-label="Campo da coluna ${esc(c)}">${ops(imp.mapa[i])}</select></td></tr>`)
        .join('')}</tbody></table></div>
        <label class="marcar"><input type="checkbox" data-imp-vazio ${imp.vazioMantem ? 'checked' : ''}> Célula vazia não altera o campo (desmarque para que a célula vazia apague o valor gravado)</label></div>`;
      rodape = `<button type="button" class="btn" data-acao="imp-voltar">Voltar</button><button type="button" class="btn pri" data-acao="imp-previa">Ver prévia</button>`;
    } else {
      const ok = imp.previa.filter((l) => l.st === 'ok').length;
      const erro = imp.previa.filter((l) => l.st === 'erro').length;
      const igual = imp.previa.filter((l) => l.st === 'igual').length;
      const gravados = imp.previa.filter((l) => l.res === 'ok').length;
      const falhas = imp.previa.filter((l) => l.res === 'falha').length;
      const visiveis = imp.previa.filter((l) => imp.ver === 'todos' || (imp.ver === 'erro' ? l.st === 'erro' || l.res === 'falha' : l.st === 'ok'));
      const pill = (l: ImpLinha) =>
        l.res === 'ok'
          ? '<span class="pill noprazo">Gravado</span>'
          : l.res === 'falha'
            ? '<span class="pill atrasado">Falhou</span>'
            : l.st === 'ok'
              ? `<span class="pill mat">${imp.etapa === 'previa' ? 'A gravar' : 'Na fila'}</span>`
              : l.st === 'igual'
                ? '<span class="pill semprev">Sem alteração</span>'
                : '<span class="pill atrasado">Com erro</span>';
      const det = (l: ImpLinha) =>
        [
          ...l.erros.map((x) => `<li class="erro">${esc(x)}</li>`),
          ...(l.msg ? [`<li class="erro">${esc(l.msg)}</li>`] : []),
          ...l.mudancas.map((x) => `<li>${esc(x)}</li>`),
          ...l.avisos.map((x) => `<li class="aviso-i">${esc(x)}</li>`),
        ].join('');
      const chip = (k: Imp['ver'], t: string, n: number) => `<button type="button" class="chip" data-imp-ver="${k}" aria-pressed="${imp.ver === k}">${t}<span class="n">${n0(n)}</span></button>`;
      if (imp.etapa === 'previa') sub = `${n0(ok)} pedido${ok === 1 ? '' : 's'} para gravar · ${n0(igual)} sem alteração · ${n0(erro)} com erro (ficam de fora).`;
      else if (imp.etapa === 'gravando') sub = `Gravando ${n0(imp.feitos)} de ${n0(ok)}… não feche esta janela.`;
      else sub = `${n0(gravados)} gravado${gravados === 1 ? '' : 's'}${falhas ? ` · ${n0(falhas)} falharam` : ''}${erro ? ` · ${n0(erro)} com erro na planilha` : ''}.`;
      corpo = `<div class="pilha"><div class="chips">${chip('todos', 'Todas', imp.previa.length)}${chip('ok', 'Para gravar', ok)}${chip('erro', 'Com problema', erro + falhas)}</div>
        <div class="tabela-wrap imp-lista"><table class="imp-tab"><thead><tr><th>Linha</th><th>Pedido</th><th>Situação</th><th>O que muda / problema</th></tr></thead><tbody>${
          visiveis
            .slice(0, 1000)
            .map((l) => `<tr class="sem-clique"><td class="num">${l.n}</td><td class="mono">${esc(l.pedido || '–')}</td><td>${pill(l)}</td><td class="quebra"><ul class="imp-det">${det(l)}</ul></td></tr>`)
            .join('') || '<tr class="sem-clique"><td colspan="4" class="muted">Nenhuma linha.</td></tr>'
        }</tbody></table></div></div>`;
      if (imp.etapa === 'previa')
        rodape = `<button type="button" class="btn-txt" data-acao="imp-baixar">Baixar prévia (CSV)</button><button type="button" class="btn" data-acao="imp-voltar">Voltar</button><button type="button" class="btn pri" data-acao="imp-gravar" ${ok ? '' : 'disabled'}>Gravar ${n0(ok)} pedido${ok === 1 ? '' : 's'}</button>`;
      else if (imp.etapa === 'gravando') rodape = `<button type="button" class="btn pri" disabled>Gravando ${n0(imp.feitos)} de ${n0(ok)}…</button>`;
      else rodape = `<button type="button" class="btn-txt" data-acao="imp-baixar">Baixar resultado (CSV)</button><button type="button" class="btn pri" data-acao="fechar-modal">Fechar</button>`;
    }
    this.el.camada.insertAdjacentHTML(
      'beforeend',
      `<div class="fundo fundo-modal" data-acao="fechar-modal"></div><div class="modal largo imp" role="dialog" aria-modal="true" aria-label="Importar planilha"><header><h2>Atualizar pedidos por planilha</h2><p>${esc(sub)}</p></header><div class="corpo">${corpo}</div><footer>${rodape}</footer></div>`,
    );
    if (imp.etapa === 'colar') (this.el.camada.querySelector('#imp-texto') as HTMLTextAreaElement | null)?.focus();
  }

  // ---------- eventos ----------
  private ligarEventos(): void {
    const raiz = this.raiz;
    const busca = raiz.querySelector('#lg-busca') as HTMLInputElement;
    busca.addEventListener('input', () => {
      clearTimeout(this.tBusca);
      this.tBusca = window.setTimeout(() => {
        this.e.busca = busca.value;
        this.e.limite = 200;
        this.desenhar();
      }, 200);
    });
    // Filtro de data da tela (campo + periodo)
    const fData = raiz.querySelector('#lg-fdata') as HTMLSelectElement;
    const fDe = raiz.querySelector('#lg-fde') as HTMLInputElement;
    const fAte = raiz.querySelector('#lg-fate') as HTMLInputElement;
    [fData, fDe, fAte].forEach((el) =>
      el.addEventListener('change', () => {
        this.e.fData = fData.value as CampoData;
        this.e.fDe = fDe.value;
        this.e.fAte = fAte.value;
        fDe.closest('.campo')?.classList.toggle('ativo', !!(fDe.value || fAte.value));
        this.e.limite = 200;
        this.desenhar();
      }),
    );

    // Filtros de multipla escolha: caixas de marcar dentro de um painel
    raiz.addEventListener('change', (ev) => {
      const t = ev.target as HTMLInputElement;
      const k = t.dataset?.['multiOp'] as FiltroMulti | undefined;
      if (!k) return;
      const lista = this.e[k].filter((v) => v !== t.value);
      if (t.checked) lista.push(t.value);
      this.e[k] = lista;
      this.desenharMulti(k, true);
      this.e.limite = 200;
      this.desenhar();
    });
    document.addEventListener('click', (ev) => {
      if (!(ev.target as Element).closest?.('.multi')) this.fecharMultis();
    });

    raiz.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      const mb = t.closest('.multi-btn') as HTMLElement | null;
      if (mb) {
        const box = mb.closest('.multi') as HTMLElement;
        const painel = box.querySelector('.multi-painel') as HTMLElement;
        this.fecharMultis(box);
        painel.hidden = !painel.hidden;
        mb.setAttribute('aria-expanded', String(!painel.hidden));
        return;
      }
      const ml = t.closest('[data-multi-limpar]') as HTMLElement | null;
      if (ml) {
        const k = ml.dataset['multiLimpar'] as FiltroMulti;
        this.e[k] = [];
        this.desenharMulti(k);
        this.desenhar();
        return;
      }
      const aba = t.closest('[data-tela]') as HTMLElement | null;
      if (aba) {
        ev.preventDefault();
        this.irPara(aba.dataset['tela'] as string);
        return;
      }
      const nf = t.closest('[data-nf]') as HTMLElement | null;
      if (nf) {
        ev.stopPropagation();
        this.acaoNota(nf.dataset['nf'] as AcaoNf, nf.dataset['nota'] as string, nf.dataset['serie'] || '', nf.dataset['pedido'] as string);
        return;
      }
      const au = t.closest('[data-auto]') as HTMLElement | null;
      if (au) {
        this.auto.min = Number(au.dataset['auto']) || 0;
        this.auto.proxima = Date.now() + this.auto.min * 60000;
        this.auto.espera = '';
        guardar('auto-min', this.auto.min);
        this.marcarAuto();
        this.aviso(this.auto.min ? `Atualização automática a cada ${this.auto.min} minutos.` : 'Atualização automática desligada.');
        return;
      }
      const kb = t.closest('[data-kb]') as HTMLElement | null;
      if (kb) {
        ev.stopPropagation();
        void this.acaoKanban(kb.dataset['kb'] as string, Number(kb.dataset['rec']));
        return;
      }
      const hoje = t.closest('[data-hoje]') as HTMLElement | null;
      if (hoje) {
        const inp = this.el.camada.querySelector(`[data-f="${hoje.dataset['hoje']}"]`) as HTMLInputElement | null;
        if (inp && !inp.disabled) {
          inp.value = iso(this.hoje);
          this.atualizarForm();
        }
        return;
      }
      const ac = t.closest('[data-acao]') as HTMLElement | null;
      if (ac) {
        const a = ac.dataset['acao'];
        if (a === 'consultar') this.consultar();
        else if (a === 'ir') {
          // cards da Programacao: rola ate a coluna (ou bloco) dos pedidos e destaca
          const q = this.raiz.querySelector('#' + (ac.dataset['alvo'] || '')) as HTMLElement | null;
          if (q) {
            q.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            q.classList.add('destaque');
            window.setTimeout(() => q.classList.remove('destaque'), 1600);
          }
        } else if (a === 'filtro-global') {
          const v = ac.dataset['valor'] || '';
          this.e.fGlobal = this.e.fGlobal === v ? '' : v;
          this.desenhar();
        }
        else if (a === 'diag') this.abrirDiagnostico();
        else if (a === 'importar') this.abrirImportar();
        else if (a === 'xlsx') this.abrirXlsx();
        else if (a === 'xlsx-gerar') this.gerarXlsxArquivo();
        else if (a?.startsWith('imp-')) void this.acaoImp(a);
        else if (a === 'sair') this.api.fechar?.();
        else if (a === 'fechar') this.fecharComConfirmacao();
        else if (a === 'fechar-modal') this.fecharModal();
        else if (a === 'salvar') void this.salvar();
        else if (a === 'custos') this.custosAbertos = !(this.el.camada.querySelector('#lg-custos-d') as HTMLDetailsElement | null)?.open;
        else if (a === 'envio-salvar') void this.salvarEnvio(Number(ac.dataset['env']));
        else if (a === 'envio-separar') {
          this.separar.add(ac.dataset['envnf'] || '');
          this.redesenharEnvios();
        }
        else if (a === 'ev-hoje') {
          const inp = this.el.camada.querySelector('#' + (ac.dataset['alvo'] || '')) as HTMLInputElement | null;
          if (inp && !inp.disabled) inp.value = iso(this.hoje);
        } else if (a === 'custo-novo' || a === 'custo-editar') {
          this.custoEdit = a === 'custo-novo' ? '' : ac.dataset['item'] || '';
          this.custoNf = a === 'custo-novo' ? ac.dataset['envnf'] || '' : '';
          if (a === 'custo-novo' && ac.dataset['envnf'] !== undefined) (this.el.camada.querySelector('#lg-custos') as HTMLElement | null)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
          this.custosAbertos = true;
          this.redesenharCustos();
          (this.el.camada.querySelector('#cf-tipo') as HTMLElement | null)?.focus();
        } else if (a === 'custo-cancelar') {
          this.custoEdit = null;
          this.redesenharCustos();
        } else if (a === 'custo-salvar') void this.salvarCusto(this.custoEdit ? 'alterar' : 'incluir');
        else if (a === 'custo-excluir') void this.salvarCusto('excluir');
        else if (a === 'hist') {
          // o clique abre o <details>; le na 1a vez (ou de novo, se deu erro)
          if (!this.hist || this.hist.erro) void this.carregarHist();
        } else if (a === 'cf-hoje') {
          const d = this.el.camada.querySelector('#cf-data') as HTMLInputElement | null;
          if (d) d.value = iso(this.hoje);
        }
        else if (a === 'limpar-filtros') this.limparFiltros();
        else if (a === 'mais-lista') {
          this.e.limite += 300;
          this.desenhar();
        } else if (a === 'exportar') this.exportar();
        else if (a === 'ent-todos' || a === 'ent-recentes') {
          this.e.entTodos = a === 'ent-todos';
          this.desenhar();
        }
        return;
      }
      const ver = t.closest('[data-imp-ver]') as HTMLElement | null;
      if (ver && this.imp) {
        this.imp.ver = ver.dataset['impVer'] as Imp['ver'];
        this.desenharImp();
        return;
      }
      const mq = t.closest('[data-mais-quadro]') as HTMLElement | null;
      if (mq) {
        const k = mq.dataset['maisQuadro'] as Etapa;
        this.e.limQuadro[k] += LIMITE_CARTOES;
        this.desenhar();
        return;
      }
      const cmp = t.closest('[data-compara]') as HTMLElement | null;
      if (cmp) {
        this.e.compara = cmp.dataset['compara'] as string;
        guardar('compara', this.e.compara);
        this.desenhar();
        return;
      }
      const med = t.closest('[data-medida]') as HTMLElement | null;
      if (med) {
        this.e.medida = med.dataset['medida'] as Estado['medida'];
        guardar('medida', this.e.medida);
        this.desenhar();
        return;
      }
      const orr = t.closest('[data-ord-rank]') as HTMLElement | null;
      if (orr) {
        const k = orr.dataset['ordRank'] as string;
        this.e.ordRank = { k, asc: this.e.ordRank.k === k ? !this.e.ordRank.asc : false };
        this.desenhar();
        return;
      }
      const th = t.closest('th[data-ord]') as HTMLElement | null;
      if (th) {
        const k = th.dataset['ord'] as string;
        this.e.ord = { k, asc: this.e.ord.k === k ? !this.e.ord.asc : true };
        this.desenhar();
        return;
      }
      const ped = t.closest('[data-ped]') as HTMLElement | null;
      if (ped && !this.el.camada.contains(ped)) {
        this.gaveta(Number(ped.dataset['ped']));
      }
    });

    // Programacao: arrastar o pedido para outro dia (ou para "Sem programacao")
    // (aba Entregas: data-arrasta-ent / data-dia-ent, muda a previsao de entrega)
    const colAlvo = (ev: Event) => (ev.target as HTMLElement).closest?.(this.arrastoEnt ? '[data-dia-ent]' : '[data-dia]') as HTMLElement | null;
    raiz.addEventListener('dragstart', (ev) => {
      const c = (ev.target as HTMLElement).closest?.('[data-arrasta],[data-arrasta-ent]') as HTMLElement | null;
      if (!c || !ev.dataTransfer) return;
      this.arrastoEnt = c.hasAttribute('data-arrasta-ent');
      const rec = (this.arrastoEnt ? c.dataset['arrastaEnt'] : c.dataset['arrasta']) as string;
      ev.dataTransfer.setData('text/plain', rec);
      ev.dataTransfer.effectAllowed = 'move';
      this.arrastando = Number(rec);
      c.classList.add('arrastando');
    });
    raiz.addEventListener('dragend', (ev) => {
      (ev.target as HTMLElement).classList?.remove('arrastando');
      this.arrastando = 0;
      raiz.querySelectorAll('.kb-col.alvo').forEach((x) => x.classList.remove('alvo'));
    });
    raiz.addEventListener('dragover', (ev) => {
      const col = colAlvo(ev);
      if (!col || !this.arrastando) return;
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
      if (!col.classList.contains('alvo')) {
        raiz.querySelectorAll('.kb-col.alvo').forEach((x) => x.classList.remove('alvo'));
        col.classList.add('alvo');
      }
    });
    raiz.addEventListener('drop', (ev) => {
      const col = colAlvo(ev);
      if (!col) return;
      ev.preventDefault();
      col.classList.remove('alvo');
      const rec = Number(ev.dataTransfer?.getData('text/plain') || this.arrastando);
      this.arrastando = 0;
      if (!rec) return;
      if (this.arrastoEnt) void this.prever(rec, col.dataset['diaEnt'] as string);
      else void this.programar(rec, col.dataset['dia'] === '-' ? '' : (col.dataset['dia'] as string));
    });

    // Ordem dos quadros e campos da importacao
    raiz.addEventListener('change', (ev) => {
      const t = ev.target as HTMLInputElement;
      const fq = t.dataset?.['filtroQuadro'] as Etapa | undefined;
      if (fq) {
        this.e.fQuadro[fq] = t.value;
        this.e.limQuadro[fq] = LIMITE_CARTOES;
        this.desenhar();
        return;
      }
      const oq = t.dataset?.['ordQuadro'] as Etapa | undefined;
      if (oq) {
        this.e.ordQuadro[oq] = t.value;
        guardar('ord-quadro', this.e.ordQuadro);
        this.desenhar();
        return;
      }
      if (!this.imp) return;
      if (t.dataset['impCol'] !== undefined) this.imp.mapa[Number(t.dataset['impCol'])] = t.value as Destino;
      else if (t.dataset['impVazio'] !== undefined) this.imp.vazioMantem = t.checked;
      else if (t.dataset['impArq'] !== undefined && t.files?.[0]) {
        void lerArquivo(t.files[0]).then((txt) => {
          if (!this.imp) return;
          this.imp.texto = txt;
          void this.acaoImp('imp-ler');
        });
      }
    });
    raiz.addEventListener('input', (ev) => {
      const t = ev.target as HTMLTextAreaElement;
      if (t.id === 'imp-texto' && this.imp) this.imp.texto = t.value;
      // Programacao: filtro digitado da coluna "Nao sairam"; redesenha e devolve o foco ao campo
      if (t.id === 'kb-filtro-nao') {
        clearTimeout(this.tFiltroNao);
        this.tFiltroNao = window.setTimeout(() => {
          this.fNaoSairam = t.value;
          this.desenhar();
          const novo = this.raiz.querySelector('#kb-filtro-nao') as HTMLInputElement | null;
          if (novo) {
            novo.focus();
            novo.setSelectionRange(novo.value.length, novo.value.length);
          }
        }, 200);
      }
    });

    // Formulario da gaveta: qualquer mudanca reconfere as regras
    this.el.camada.addEventListener('input', (ev) => {
      if (!(ev.target as HTMLElement).closest('#lg-form')) return;
      this.atualizarForm();
    });
    this.el.camada.addEventListener('change', (ev) => {
      const t = ev.target as HTMLElement;
      if (!t.closest('#lg-form')) return;
      // marcou "finalizado sem entrega": a data comeca em hoje
      if (t instanceof HTMLInputElement && t.dataset['f'] === 'finalizado' && t.checked) {
        const d = this.el.camada.querySelector<HTMLInputElement>('[data-f="dataFinal"]');
        if (d && !d.value) d.value = iso(this.hoje);
      }
      this.atualizarForm();
    });
    this.el.camada.addEventListener('submit', (ev) => ev.preventDefault());
    // Cobranca: "Sem CTE" desliga o numero do CTE e mostra a explicacao
    this.el.camada.addEventListener('change', (ev) => {
      const t = ev.target as HTMLInputElement;
      if (t.id !== 'cf-semcte') return;
      const cte = this.el.camada.querySelector('#cf-cte') as HTMLInputElement | null;
      if (cte) {
        cte.disabled = t.checked;
        if (t.checked) cte.value = '';
      }
      const dica = this.el.camada.querySelector('#cf-dica-sem') as HTMLElement | null;
      if (dica) dica.hidden = !t.checked;
    });
    // Exportar XLSX: qualquer opcao redesenha as contagens
    this.el.camada.addEventListener('change', (ev) => {
      const t = ev.target as HTMLInputElement;
      if (!this.xl || !t.closest('#lg-xlsx')) return;
      if (t.name === 'xl-rec') this.xl.recorte = t.value;
      else if (t.name === 'xl-filtros') this.xl.filtros = t.checked;
      else if (t.name === 'xl-aba') {
        if (t.checked) this.xl.abas.add(t.value);
        else this.xl.abas.delete(t.value);
      }
      guardar('xlsx', { recorte: this.xl.recorte, filtros: this.xl.filtros, abas: [...this.xl.abas] });
      this.desenharXlsx();
    });

    // Tooltip dos graficos: um so, segue o ponteiro
    const tip = document.createElement('div');
    tip.className = 'tip';
    tip.hidden = true;
    raiz.appendChild(tip);
    raiz.addEventListener('mousemove', (ev) => {
      const el = (ev.target as Element).closest('[data-tip]');
      if (!el) {
        tip.hidden = true;
        return;
      }
      tip.textContent = el.getAttribute('data-tip');
      tip.hidden = false;
      const x = Math.min(ev.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
      const y = ev.clientY + 16 + tip.offsetHeight > window.innerHeight ? ev.clientY - tip.offsetHeight - 10 : ev.clientY + 16;
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
    });
    raiz.addEventListener('mouseleave', () => (tip.hidden = true));
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      if (this.raiz.querySelector('.multi-painel:not([hidden])')) this.fecharMultis();
      else if (this.el.camada.querySelector('.modal')) this.fecharModal();
      else if (this.aberto) this.fecharComConfirmacao();
    });
  }
}
