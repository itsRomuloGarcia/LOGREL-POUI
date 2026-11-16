import * as G from './graficos';
import { autoMapa, baixar, celulaCsv, dataIso, Destino, DESTINOS, DESTINOS_IMP, lerArquivo, lerTabela, numBR, numPedido, opcaoDe, semValor, simNao } from './importar';
import { ItemPedido, LogResposta, Opcao, Pedido, PedidoEdicao } from './log.service';

// Tela Logistica (pedidos de entrega): Quadros (previstos, faturados, enviados,
// entregues), Lista completa (um item por linha, com exportacao) e Indicadores.
// A edicao de todos os campos de logistica do pedido e feita na gaveta do pedido.
// Desenhada direto no DOM (todo texto passa por esc()), no mesmo padrao e
// visual da tela RX Pedidos (PCPREL).

/** So o DANFE: a carta de correcao saiu da tela em 16/11/2026 (pedido do usuario) */
export type AcaoNf = 'danfe';

export interface Api {
  carregar(de: string, ate: string): void;
  salvar(recno: number, d: PedidoEdicao): Promise<Pedido>;
  /** Pedidos pelo numero, sem filtro (importacao de pedido que nao veio na consulta) */
  buscarPedidos(pedidos: string[]): Promise<Pedido[]>;
  mensagemErro(e: unknown): string;
  diagnostico(): Promise<string>;
  fechar: (() => void) | null;
  /** DANFE pela SPEDNFE (so dentro do Protheus; false = sem canal) */
  nota: ((acao: AcaoNf, d: { nota: string; serie: string; pedido: string }) => boolean) | null;
}

// ---------- regras ----------
type Etapa = 'prev' | 'fat' | 'env' | 'ent' | 'ret';
type Prazo = 'noprazo' | 'vence' | 'atrasado' | 'semprev' | '';

const ETAPAS: { id: Etapa; nome: string; curto: string; desc: string; cor: string }[] = [
  { id: 'prev', nome: 'Pedidos previstos', curto: 'Previsto', desc: 'Todos os pedidos sem nota fiscal', cor: G.CAT[3] },
  { id: 'fat', nome: 'Pedidos faturados', curto: 'Faturado', desc: 'Com NF, aguardando a saída', cor: G.CAT[0] },
  { id: 'env', nome: 'Pedidos enviados', curto: 'Enviado', desc: 'Saíram da empresa, sem entrega', cor: G.CAT[1] },
  { id: 'ent', nome: 'Pedidos entregues', curto: 'Entregue', desc: 'Entrega confirmada', cor: G.CAT[2] },
  // mercadoria voltou para a empresa; o reenvio sai em outro pedido (13/11/2026)
  { id: 'ret', nome: 'Pedidos retornados', curto: 'Retornou', desc: 'Voltaram para a empresa', cor: G.COR_OUTROS },
];
/** C5_TIPO diferente de N (os Previstos trazem todos os pedidos sem NF) */
const TIPO_NF: Record<string, string> = { D: 'Devolução', B: 'Beneficiamento', C: 'Compl. preço', I: 'Compl. ICMS', P: 'Compl. IPI' };
const ET = Object.fromEntries(ETAPAS.map((e) => [e.id, e])) as Record<Etapa, (typeof ETAPAS)[number]>;

const PRAZO_TXT: Record<Prazo, string> = { noprazo: 'No prazo', vence: 'Vence em até 2 dias', atrasado: 'Atrasado', semprev: 'Sem previsão', '': '' };
const COR_OK = '#2f7d32';
const COR_ATR = '#b42318';
const COR_NEUTRA = G.COR_OUTROS;
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
];
/** C5_ZMOTRET informado pelo usuario em 13/11/2026 */
const MOTRET_PADRAO: Opcao[] = [['1', 'Recusa'], ['2', 'Endereço'], ['3', 'Avaria'], ['4', 'Outros']];
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
  obsEntrega: 'C5_ZOBS',
};
const NUMEROS: (keyof PedidoEdicao)[] = ['valorCte', 'valorCteReentrega', 'frete', 'volume', 'freteNaoDestacado', 'pesoLiquido', 'pesoBruto'];
const REENTREGA: (keyof PedidoEdicao)[] = ['cteReentrega', 'valorCteReentrega', 'dataNovaEntrega'];
/** Dados do pedido que vao para a NF-e: so editam antes da nota (frete destacado e
 *  nao destacado sao so consulta desde 15/11/2026, pedido do usuario) */
const COMERCIAIS: (keyof PedidoEdicao)[] = ['transportadora', 'volume', 'especie', 'pesoLiquido', 'pesoBruto'];
/** Tem que estar preenchidos antes da emissao da NF-e (pedido do usuario, 15/11/2026) */
const PARA_NFE: (keyof PedidoEdicao)[] = ['especie', 'pesoLiquido', 'pesoBruto'];
/** Peso com ate 4 casas (C5_PESOL/C5_PBRUTO), sem zeros a mais */
const pesoTxt = (n: number | undefined) => (n ? n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 }) : '');
/** So valem com a data do retorno */
const RETORNO: (keyof PedidoEdicao)[] = ['motivoRetorno', 'pedidoReenvio'];
const ROTULO: Record<string, string> = Object.fromEntries(DESTINOS.filter(([d]) => d && d !== 'pedido'));

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
  ret: [
    ['aguarda', 'Aguardando reenvio primeiro (mais antigos)', (r) => (r.p.pedidoReenvio ? '1' : '0') + (r.p.dataRetorno || ''), true],
    ['ret-desc', 'Retorno: mais recentes primeiro', (r) => r.p.dataRetorno || '', false],
    ['ret-asc', 'Retorno: mais antigos primeiro', (r) => r.p.dataRetorno || '', true],
  ],
};

/** Pedidos enviados agregados por transportadora (ranking e comparacao) */
interface LnTransp { nome: string; env: number; ent: number; noPrazo: number; atr: number; comPrev: number; atrDias: number; lead: number; nLead: number; custo: number; nCte: number; cobrado: number; reent: number; qtd: number }
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
  custo: number;
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
  /** indicadores: medida da tabela por transportadora x mes */
  medida: 'custo' | 'cobrado' | 'pedidos';
  ordRank: { k: string; asc: boolean };
  /** indicadores: medida do grafico de comparacao entre transportadoras (COMPARA) */
  compara: string;
}

const ABAS: [string, string][] = [
  ['quadros', 'Quadros'],
  ['programacao', 'Programação'],
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
  /** Programacao: pedidos gravando (botao desligado) e o que esta sendo arrastado */
  private readonly ocupados = new Set<number>();
  private arrastando = 0;
  private limSemProg = LIMITE_CARTOES;
  /** importacao por planilha (janela aberta) */
  private imp: Imp | null = null;
  /** gaveta aberta: recno do pedido */
  private aberto = 0;
  private tAviso = 0;
  private tBusca = 0;
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
      limQuadro: { prev: LIMITE_CARTOES, fat: LIMITE_CARTOES, env: LIMITE_CARTOES, ent: LIMITE_CARTOES, ret: LIMITE_CARTOES },
      entTodos: false,
      // a preferencia guardada antes da coluna Retornados nao tem "ret"
      ordQuadro: { prev: 'emi-asc', fat: 'fat-asc', env: 'prev-asc', ent: 'ent-desc', ret: 'aguarda', ...ler('ord-quadro', {}) },
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
            <button class="btn pri" data-acao="consultar">Atualizar dados</button>
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
        <div class="wrap controles consulta">
          <div class="campo"><label for="lg-de" title="O período vale para os pedidos com NF. Os pedidos sem NF (Previstos) vêm todos, de qualquer emissão.">Consultar no Protheus: emissão dos pedidos com NF</label><div class="periodo"><input id="lg-de" type="date" value="${iso(this.e.de)}" aria-label="De"><span class="muted">a</span><input id="lg-ate" type="date" value="${iso(this.e.ate)}" aria-label="Até"><button class="btn pri" data-acao="consultar">Consultar</button></div></div>
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
  }

  // ---------- dados ----------
  definirDados(r: LogResposta): void {
    this.resp = r;
    this.faltando = new Set(r.camposFaltando || []);
    // API anterior a 2026-11-15a nao le nem grava especie e pesos: desliga os campos
    if (!r.versao || r.versao < '2026-11-15a') PARA_NFE.forEach((k) => this.faltando.add(CAMPO[k]));
    // API anterior a 2026-11-15b: sem C5_ZOBS e a saida programada ainda copia para o envio
    if (!r.versao || r.versao < '2026-11-15b') this.faltando.add(CAMPO.obsEntrega);
    this.regs = (r.pedidos || []).map((p) => this.montar(p));
    this.carregando = false;
    this.erroCarga = '';
    this.opcoesFiltros();
    this.el.faltam.hidden = !this.faltando.size;
    this.el.faltam.innerHTML = this.faltando.size
      ? `<p class="aviso"><b>Campos ainda não criados na SC5 deste ambiente:</b> ${esc([...this.faltando].join(', '))}. Eles aparecem vazios e a edição deles fica desligada.</p>`
      : '';
    this.desenhar();
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
    const et: Etapa = p.dataRetorno ? 'ret' : entFinal ? 'ent' : p.dataEnvio ? 'env' : temNota ? 'fat' : 'prev';
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
    return {
      p,
      et,
      entFinal,
      prazo,
      atraso,
      cobrado: (p.frete || 0) + (p.freteNaoDestacado || 0),
      custo: (p.valorCte || 0) + (p.valorCteReentrega || 0),
      qtd: itens.reduce((s, i) => s + (i.quantidade || 0), 0),
      valor: itens.reduce((s, i) => s + (i.valor || 0), 0),
      parcial: temNota && itens.some((i) => !i.nota),
      produtos,
      busca: normal(
        [p.pedido, p.nome, p.fantasia, p.cidade, p.uf, p.transportadoraNome, p.vendedor, p.grupo, p.cte, p.cteReentrega, ...(p.notas || []), produtos, p.nomeEntrega, p.pedidoReenvio, p.obsEntrega, ...itens.flatMap((i) => (i.numerosSerie || []).map((s) => s[0]))].join(' '),
      ),
    };
  }

  private reg(recno: number): Reg | undefined {
    return this.regs.find((r) => r.p.recno === recno);
  }

  // ---------- opcoes ----------
  private op(k: 'tipoMaterial' | 'indicador' | 'tipoPedido' | 'motivoRetorno'): Opcao[] {
    const v = this.resp?.opcoes?.[k] || [];
    if (v.length) return v;
    return k === 'tipoMaterial' ? TPMAT_PADRAO : k === 'indicador' ? INDICA_PADRAO : k === 'motivoRetorno' ? MOTRET_PADRAO : TIPOPED_PADRAO;
  }
  private txtOp(k: 'tipoMaterial' | 'indicador' | 'tipoPedido' | 'motivoRetorno', cod: string): string {
    if (!cod) return '';
    const o = this.op(k).find((x) => x[0] === cod);
    return o ? o[1] : cod;
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
      situacao: SITUACOES,
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
    const { transp, uf, tpmat, tipo, situacao, fDe, fAte } = this.e;
    const em = (lista: string[], v: string) => !lista.length || lista.includes(v);
    return this.regs.filter((r) => {
      if (q && !r.busca.includes(q)) return false;
      if (!em(transp, r.p.transportadora || '-') || !em(uf, r.p.uf || '-') || !em(tpmat, r.p.tipoMaterial || '-') || !em(tipo, r.p.tipoPedido || '-')) return false;
      if (situacao.length && !situacao.includes(r.prazo)) return false;
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
      lista: () => this.telaLista(),
      indicadores: () => this.telaIndicadores(),
    };
    this.el.conteudo.innerHTML = (this.carregando ? `<p class="aviso">Atualizando…</p>` : '') + (telas[t] || telas['quadros'])();
  }

  // ---------- Quadros ----------
  private telaQuadros(): string {
    const regs = this.base();
    const limEnt = new Date(this.hoje.getTime() - DIAS_ENTREGUES * 86400000);
    const atrTransito = regs.filter((r) => r.et === 'env' && r.prazo === 'atrasado').length;
    const venceTransito = regs.filter((r) => r.et === 'env' && r.prazo === 'vence').length;
    const fatParado = regs.filter((r) => r.et === 'fat' && r.p.dataFaturamento && dias(dt(r.p.dataFaturamento) as Date, this.hoje) > 2).length;
    const cols = ETAPAS.map((et) => {
      const opcoes = ORD_QUADRO[et.id];
      const [, , chave, asc] = opcoes.find((o) => o[0] === this.e.ordQuadro[et.id]) || opcoes[0];
      let lista = regs
        .filter((r) => r.et === et.id)
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
      if (et.id === 'ent' && !this.e.entTodos) {
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
        <header><h2><span>${esc(et.nome)}</span><span class="q num">${n0(total)}</span></h2><p>${esc(et.desc)} · ${n0(qtd)} un</p>${seletor}${entInfo ? `<p>${entInfo}</p>` : ''}</header>
        <div class="lista">${cartoes || '<p class="muted vazio">Nenhum pedido.</p>'}${mais ? `<div class="mais">${mais}</div>` : ''}</div>
      </section>`;
    }).join('');
    const kpi = (r: string, v: string, s: string, crit = false) => `<div class="kpi${crit ? ' crit' : ''}"><div class="r">${r}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
    return `<div class="resumo">
        ${kpi('Em trânsito atrasados', n0(atrTransito), 'passaram da previsão da transportadora', atrTransito > 0)}
        ${kpi('Vencem em até 2 dias', n0(venceTransito), 'em trânsito, perto da previsão')}
        ${kpi('Faturados parados', n0(fatParado), 'com NF há mais de 2 dias, sem envio', fatParado > 0)}
        ${kpi('Sem previsão de entrega', n0(regs.filter((r) => r.et === 'env' && r.prazo === 'semprev').length), 'enviados sem a data da transportadora')}
        ${(() => {
          if (PARA_NFE.every((k) => this.faltando.has(CAMPO[k]))) return '';
          const sem = regs.filter((r) => this.faltaNfe(r.p).length).length;
          return kpi('Sem dados para a NF-e', n0(sem), 'sem NF e falta espécie, peso líquido ou bruto', sem > 0);
        })()}
        ${(() => {
          const ag = regs.filter((r) => r.et === 'ret' && !r.p.pedidoReenvio).length;
          return kpi('Aguardando reenvio', n0(ag), 'voltaram e ainda sem o pedido do reenvio', ag > 0);
        })()}
      </div>
      <div class="quadros">${cols}</div>`;
  }

  private cartao(r: Reg): string {
    const p = r.p;
    const pills: string[] = [];
    if (p.tipoNf && p.tipoNf !== 'N') pills.push(`<span class="pill semprev">${esc(TIPO_NF[p.tipoNf] || `Tipo ${p.tipoNf}`)}</span>`);
    if (p.tipoMaterial) pills.push(`<span class="pill mat">${esc(this.txtOp('tipoMaterial', p.tipoMaterial))}</span>`);
    if (r.prazo && r.prazo !== 'noprazo') pills.push(this.pillPrazo(r, true));
    if (p.reentrega === 'SIM') pills.push(`<span class="pill reent">Reentrega</span>`);
    if (r.parcial) pills.push(`<span class="pill semprev">NF parcial</span>`);
    if (r.et === 'ret' && !p.pedidoReenvio) pills.push(`<span class="pill atrasado">Aguardando reenvio</span>`);
    if (r.et === 'ret' && p.motivoRetorno) pills.push(`<span class="pill semprev">${esc(this.txtOp('motivoRetorno', p.motivoRetorno))}</span>`);
    let datas = '';
    if (r.et === 'prev') datas = p.previsaoSaida ? `Saída programada ${fmtCurto(p.previsaoSaida)}` : `Emitido ${fmtCurto(p.emissao)}`;
    else if (r.et === 'fat') datas = `NF ${esc((p.notas || []).join(', '))} · ${fmtCurto(p.dataFaturamento)}${p.dataFaturamento ? ` (há ${dias(dt(p.dataFaturamento) as Date, this.hoje)} d)` : ''}`;
    else if (r.et === 'env') datas = `Envio ${fmtCurto(p.dataEnvio)} · Previsão ${p.dataPrevisao ? fmtCurto(p.dataPrevisao) : '–'}`;
    else if (r.et === 'ret') datas = `Retornou ${fmtCurto(p.dataRetorno || '')} (há ${dias(dt(p.dataRetorno || '') as Date, this.hoje)} d)${p.pedidoReenvio ? ` · Reenvio no pedido ${esc(p.pedidoReenvio)}` : ''}`;
    else datas = `Entregue ${fmtCurto(r.entFinal)}${p.dataPrevisao ? ` · Previsão ${fmtCurto(p.dataPrevisao)}` : ''}`;
    return `<button type="button" class="cartao" data-ped="${p.recno}" style="--cor:${ET[r.et].cor}">
      <span class="l1"><b class="mono">${esc(p.pedido)}</b>${pills.join('')}</span>
      <span class="cli" title="${esc(p.nome)}">${esc(p.fantasia || p.nome || '(sem nome)')}</span>
      <span class="m">${esc([p.cidade, p.uf].filter(Boolean).join('/') || 'sem cidade')} · ${esc(this.transpNome(r))}</span>
      <span class="m">${n0(r.qtd)} un · ${rs0(r.valor)}${p.cte ? ` · CTE ${esc(p.cte)}` : ''}</span>
      <span class="m">${datas}</span>
    </button>`;
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
    const regs = this.base();
    const apiVelha = !this.resp?.versao || this.resp.versao < '2026-11-15b';
    const dias0 = this.diasProgramacao();
    // fim de semana dentro do periodo so aparece se tiver pedido programado
    const fimFaixa = dias0[dias0.length - 1];
    const comFds = [...new Set(regs.map((r) => r.p.previsaoSaida).filter((d) => d && d > hj && d < fimFaixa && !dias0.includes(d)))];
    const dias = [...dias0, ...comFds].sort();
    const pend = (r: Reg) => !r.p.dataEnvio;
    const naoSairam = regs.filter((r) => r.p.previsaoSaida && r.p.previsaoSaida < hj && pend(r)).sort((a, b) => a.p.previsaoSaida.localeCompare(b.p.previsaoSaida));
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
    const coluna = (dia: string, titulo: string, sub: string, cor: string, itens: Reg[], extra = '', soltar = true) =>
      `<section class="quadro kb-col" ${soltar && !apiVelha ? `data-dia="${dia}"` : ''} style="--cor:${cor}" aria-label="${esc(titulo)}">
        <header><h2><span>${esc(titulo)}</span><span class="q num">${n0(itens.length)}</span></h2><p>${sub}</p></header>
        <div class="lista">${itens.map((r) => this.cartaoKb(r, dia, apiVelha)).join('') || `<p class="muted vazio">${soltar && !apiVelha ? 'Arraste pedidos para cá.' : 'Nenhum pedido.'}</p>`}${extra}</div>
      </section>`;
    const kpi = (r: string, v: string, s: string, crit = false) => `<div class="kpi${crit ? ' crit' : ''}"><div class="r">${r}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
    const cols = [
      coluna('', 'Não saíram', 'saída programada já passou e sem envio', '#b3261e', naoSairam, '', false),
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
        ${kpi('Saem hoje', n0(hoje.length), `${n0(sairamHoje)} saíram · ${n0(hoje.length - sairamHoje)} falta sair`)}
        ${kpi('Não saíram', n0(naoSairam.length), 'saída programada passou sem envio', naoSairam.length > 0)}
        ${kpi('Entregas previstas hoje', n0(entHoje.length), `${n0(entregues)} entregues · ${n0(entHoje.length - entregues)} em trânsito`)}
        ${kpi('Com NF sem programação', n0(sem_fat), 'faturados ainda sem data de saída', sem_fat > 0)}
      </div>
      <section class="painel">
        <header><h2>Programação de saídas</h2><p>Saída programada = data de saída do pedido (C5_FECENT). Arraste o cartão para o dia em que ele deve sair, ou para "Sem programação" para tirar a data. "Saiu" grava a data de envio de hoje. Clique no cartão para abrir o pedido.</p></header>
        <div class="kb-quadro">${cols}</div>
      </section>
      <section class="painel">
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
        linha = `<span class="m">Enviado ${fmtCurto(p.dataEnvio)}${p.cte ? ` · CTE ${esc(p.cte)}` : ''}</span>`;
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

  private async acaoKanban(acao: string, recno: number): Promise<void> {
    const hj = iso(this.hoje);
    if (acao === 'mais') {
      this.limSemProg += LIMITE_CARTOES;
      this.desenhar();
      return;
    }
    const r = this.reg(recno);
    if (!r) return;
    if (acao === 'saiu') await this.gravarRapido(r, { dataEnvio: hj }, `Pedido ${r.p.pedido}: saída registrada hoje.`);
    else if (acao === 'desfazer') await this.gravarRapido(r, { dataEnvio: '' }, `Pedido ${r.p.pedido}: saída desfeita.`);
    else if (acao === 'entregue') {
      const reent = r.p.reentrega === 'SIM' && !this.faltando.has(CAMPO.dataNovaEntrega);
      await this.gravarRapido(r, reent ? { dataNovaEntrega: hj } : { dataEntrega: hj }, `Pedido ${r.p.pedido}: entrega registrada hoje.`);
    }
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
      { k: 'emi', t: 'Emissão', v: (r) => r.p.emissao, f: d },
      { k: 'cli', t: 'Cliente', v: (r) => r.p.cliente },
      { k: 'loja', t: 'Loja', v: (r) => r.p.loja },
      { k: 'nome', t: 'Nome', v: (r) => r.p.nome },
      { k: 'cid', t: 'Cidade (entrega)', v: (r) => r.p.cidade },
      { k: 'uf', t: 'UF', v: (r) => r.p.uf },
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
      { k: 'frete', t: 'Frete destacado', v: (r) => r.p.frete, f: m, dir: true, tit: 'C5_FRETE (do pedido, repete em cada item)' },
      { k: 'vol', t: 'Volume', v: (r) => r.p.volume, f: (v) => (v ? n0(Number(v)) : ''), dir: true },
      { k: 'esp', t: 'Espécie', v: (r) => r.p.especie || '', tit: 'C5_ESPECI1 (do pedido, repete em cada item)' },
      { k: 'pliq', t: 'Peso líquido', v: (r) => r.p.pesoLiquido || 0, f: (v) => pesoTxt(Number(v)), dir: true, tit: 'C5_PESOL (do pedido, repete em cada item)' },
      { k: 'obs', t: 'Observações da entrega', v: (r) => r.p.obsEntrega || '', tit: 'C5_ZOBS' },
      { k: 'pbru', t: 'Peso bruto', v: (r) => r.p.pesoBruto || 0, f: (v) => pesoTxt(Number(v)), dir: true, tit: 'C5_PBRUTO (do pedido, repete em cada item)' },
      { k: 'fnd', t: 'Frete não destacado', v: (r) => r.p.freteNaoDestacado, f: m, dir: true, tit: 'C5_ZFRETE (do pedido, repete em cada item)' },
      { k: 'tpmat', t: 'Tipo de material', v: (r) => this.txtOp('tipoMaterial', r.p.tipoMaterial) },
      { k: 'denv', t: 'Envio', v: (r) => r.p.dataEnvio, f: d },
      { k: 'dprev', t: 'Previsão entrega', v: (r) => r.p.dataPrevisao, f: d },
      { k: 'dent', t: 'Entrega', v: (r) => r.p.dataEntrega, f: d },
      { k: 'cte', t: 'CTE', v: (r) => r.p.cte },
      { k: 'vcte', t: 'Valor CTE', v: (r) => r.p.valorCte, f: m, dir: true },
      { k: 'reent', t: 'Reentrega', v: (r) => r.p.reentrega },
      { k: 'ctere', t: 'CTE reentrega', v: (r) => r.p.cteReentrega },
      { k: 'vctere', t: 'Valor CTE reentrega', v: (r) => r.p.valorCteReentrega, f: m, dir: true },
      { k: 'dnova', t: 'Nova entrega', v: (r) => r.p.dataNovaEntrega, f: d },
      { k: 'ind', t: 'Indicador de atraso', v: (r) => this.txtOp('indicador', r.p.indicador) },
      { k: 'dret', t: 'Retorno', v: (r) => r.p.dataRetorno || '', f: d },
      { k: 'motret', t: 'Motivo do retorno', v: (r) => this.txtOp('motivoRetorno', r.p.motivoRetorno || '') },
      { k: 'pedren', t: 'Pedido do reenvio', v: (r) => r.p.pedidoReenvio || '' },
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
    const datas = new Set(['emi', 'dfat', 'denv', 'dprev', 'dent', 'dnova']);
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
    const regs = this.base();
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
      ${kpi('Custo de CTE', rs0(custo), `${n0(comCte.length)} pedidos com CTE lançado`)}
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
        ${cartao('Frete acumulado por transportadora', 'Pelo mês do envio. Custo = CTE + CTE de reentrega; cobrado = frete destacado + não destacado.', this.acumulado(enviados), 'largo')}
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
      const g = m.get(k) || { nome: this.transpNome(r), env: 0, ent: 0, noPrazo: 0, atr: 0, comPrev: 0, atrDias: 0, lead: 0, nLead: 0, custo: 0, nCte: 0, cobrado: 0, reent: 0, qtd: 0 };
      g.env++;
      g.qtd += r.qtd;
      g.custo += r.custo;
      if (r.custo > 0) g.nCte++;
      g.cobrado += r.cobrado;
      if (r.p.reentrega === 'SIM') g.reent++;
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
    const combo = (k: keyof PedidoEdicao, rot: string, ops: Opcao[], v: string) =>
      `<div class="campo"><label for="f-${k}">${rot}</label><select id="f-${k}" data-f="${k}" ${dis(k)} ${tit(k)}><option value="">(não informado)</option>${ops.map(([c, t]) => `<option value="${esc(c)}" ${c === v ? 'selected' : ''}>${esc(c)} - ${esc(t)}</option>`).join('')}${v && !ops.some(([c]) => c === v) ? `<option value="${esc(v)}" selected>${esc(v)}</option>` : ''}</select></div>`;
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
    if (p.dataRetorno) passos.push(['Retorno à empresa', p.dataRetorno]);
    // este pedido e o reenvio de outro (que voltou)?
    const origem = this.regs.filter((x) => x.p.pedidoReenvio === p.pedido).map((x) => x.p.pedido);
    const tempo = passos
      .map(([t, d]) => `<li class="${d ? '' : 'vazio'}"><b>${esc(t)}</b><br><span class="${d ? '' : 'muted'}">${d ? fmt(d) : 'não informado'}</span></li>`)
      .join('');
    const dif = r.cobrado - r.custo;

    this.el.camada.innerHTML = `<div class="fundo" data-acao="fechar"></div>
      <aside class="gaveta" role="dialog" aria-modal="true" aria-label="Pedido ${esc(p.pedido)}">
        <header><div>
          <h2>Pedido <span class="mono">${esc(p.pedido)}</span></h2>
          <span class="titulo-item">${esc(p.nome)}</span>
          <span class="pilha-h"><span class="pill etapa" style="--cor:${ET[r.et].cor}">${esc(ET[r.et].curto)}</span>${this.pillPrazo(r)}${reent ? '<span class="pill reent">Reentrega</span>' : ''}${r.parcial ? '<span class="pill semprev">NF parcial</span>' : ''}${r.et === 'ret' && !p.pedidoReenvio ? '<span class="pill atrasado">Aguardando reenvio</span>' : ''}${origem.length ? `<span class="pill mat">Reenvio do pedido ${esc(origem.join(', '))}</span>` : ''}</span>
        </div><button class="fechar" data-acao="fechar" aria-label="Fechar">×</button></header>
        <div class="rolar">
          ${this.barraNotas(p)}
          <form class="form-log" id="lg-form" autocomplete="off">
            <fieldset class="grupo-f"><legend>Dados do pedido</legend>
              ${faturado ? '<p class="nota inteiro">Pedido com nota fiscal: transportadora, volume, espécie e pesos já saíram na NF e não são alterados aqui.</p>' : '<p class="nota inteiro">Espécie, peso líquido e peso bruto têm que estar preenchidos antes da emissão da NF-e.</p>'}
              <div class="campo inteiro"><label for="f-transportadora">Transportadora</label><input id="f-transportadora" list="lg-transps" data-f="transportadora" value="${esc(p.transportadora ? `${p.transportadora} - ${p.transportadoraNome}` : '')}" placeholder="Código ou nome" ${dis('transportadora', faturado)}>
                <datalist id="lg-transps">${transps.map(([c, n]) => `<option value="${esc(c)} - ${esc(n)}"></option>`).join('')}</datalist></div>
              ${num('volume', 'Volume', p.volume, faturado)}
              ${texto('especie', 'Espécie', p.especie || '', faturado)}
              ${num('pesoLiquido', 'Peso líquido', p.pesoLiquido || 0, faturado)}
              ${num('pesoBruto', 'Peso bruto', p.pesoBruto || 0, faturado)}
              ${fixo('Frete destacado (R$)', 'C5_FRETE', numTxt(p.frete) || '0,00')}
              ${fixo('Frete não destacado (R$)', 'C5_ZFRETE', numTxt(p.freteNaoDestacado) || '0,00')}
              ${p.freteNaoDestacadoTexto && numBR(p.freteNaoDestacadoTexto) !== p.freteNaoDestacado ? `<p class="nota inteiro">Frete não destacado gravado como texto: "${esc(p.freteNaoDestacadoTexto)}".</p>` : ''}
            </fieldset>
            <fieldset class="grupo-f"><legend>Envio e entrega</legend>
              ${data('previsaoSaida', 'Saída programada (C5_FECENT)', p.previsaoSaida)}
              ${data('dataEnvio', 'Data de envio', p.dataEnvio)}
              ${data('dataPrevisao', 'Previsão de entrega (transportadora)', p.dataPrevisao, false, false)}
              ${data('dataEntrega', 'Data de entrega', p.dataEntrega)}
              ${combo('tipoMaterial', 'Tipo de material', this.op('tipoMaterial'), p.tipoMaterial)}
              ${combo('indicador', 'Indicador de atraso', this.op('indicador'), p.indicador)}
              <div class="campo inteiro"><label for="f-obsEntrega">Observações da entrega</label><textarea id="f-obsEntrega" data-f="obsEntrega" rows="3" ${tam[CAMPO.obsEntrega] ? `maxlength="${tam[CAMPO.obsEntrega]}"` : ''} placeholder="Texto livre: horário de recebimento, contato, acesso…" ${dis('obsEntrega')} ${tit('obsEntrega')}>${esc(p.obsEntrega || '')}</textarea></div>
            </fieldset>
            <fieldset class="grupo-f"><legend>CTE da transportadora</legend>
              ${texto('cte', 'Número do CTE', p.cte)}
              ${num('valorCte', 'Valor do CTE (R$)', p.valorCte)}
            </fieldset>
            <fieldset class="grupo-f"><legend>Reentrega</legend>
              <div class="campo"><label>Gerou reentrega?</label><div class="radios">
                <label><input type="radio" name="reentrega" data-f="reentrega" value="N" ${!reent ? 'checked' : ''} ${dis('reentrega')}> Não</label>
                <label><input type="radio" name="reentrega" data-f="reentrega" value="S" ${reent ? 'checked' : ''} ${dis('reentrega')}> Sim</label></div></div>
              ${texto('cteReentrega', 'CTE da reentrega', p.cteReentrega, !reent)}
              ${num('valorCteReentrega', 'Valor do CTE da reentrega (R$)', p.valorCteReentrega, !reent)}
              ${data('dataNovaEntrega', 'Nova data de entrega', p.dataNovaEntrega, !reent)}
            </fieldset>
            <fieldset class="grupo-f"><legend>Retorno à empresa</legend>
              <p class="nota inteiro">A mercadoria voltou e será reenviada em outro pedido. Com a data, o pedido vai para Retornados.</p>
              ${data('dataRetorno', 'Data do retorno', p.dataRetorno || '')}
              ${combo('motivoRetorno', 'Motivo do retorno', this.op('motivoRetorno'), p.motivoRetorno || '')}
              <div class="campo"><label for="f-pedidoReenvio">Pedido do reenvio</label><input id="f-pedidoReenvio" type="text" data-f="pedidoReenvio" value="${esc(p.pedidoReenvio || '')}" maxlength="6" placeholder="Nº do novo pedido" ${dis('pedidoReenvio')} ${tit('pedidoReenvio')}></div>
            </fieldset>
            <ul class="avisos-f" id="lg-avisos" aria-live="polite"></ul>
          </form>

          <section><h3>Frete</h3>
            <dl class="grade-info">
              <div><dt>Cobrado no pedido</dt><dd>${rs(r.cobrado)} <span class="muted">(destacado ${rs(p.frete)} + não destacado ${rs(p.freteNaoDestacado)})</span></dd></div>
              <div><dt>Custo de CTE</dt><dd>${rs(r.custo)}${p.valorCteReentrega ? ` <span class="muted">(reentrega ${rs(p.valorCteReentrega)})</span>` : ''}</dd></div>
              <div><dt>Cobrado − CTE</dt><dd class="${r.custo && dif < 0 ? 'crit-txt' : ''}">${r.custo ? rs(dif) : '<span class="muted">sem CTE lançado</span>'}</dd></div>
            </dl></section>

          <section><h3>Cliente e pedido</h3>
            <dl class="grade-info">
              <div><dt>Cliente / loja</dt><dd>${esc(p.cliente)} / ${esc(p.loja)}</dd></div>
              <div><dt>Nome</dt><dd>${esc(p.nome)}</dd></div>
              <div><dt>Grupo do cliente</dt><dd>${esc(p.grupo || '–')}</dd></div>
              <div><dt>Entrega</dt><dd>${esc([p.cidade, p.uf].filter(Boolean).join(' / ') || '–')}${p.nomeEntrega && p.nomeEntrega !== p.nome ? `<br><span class="muted">${esc(p.clienteEntrega)} ${esc(p.nomeEntrega)}</span>` : ''}</dd></div>
              <div><dt>Vendedor</dt><dd>${esc(p.vendedor || p.codVendedor || '–')}</dd></div>
              <div><dt>Tipo do pedido</dt><dd>${esc(this.txtOp('tipoPedido', p.tipoPedido) || '–')}</dd></div>
              <div><dt>Notas fiscais</dt><dd>${esc((p.notas || []).join(', ') || '–')}</dd></div>
              <div><dt>Valor dos itens</dt><dd>${rs(r.valor)} · ${n0(r.qtd)} un</dd></div>
            </dl></section>

          <section><h3>Itens</h3>
            <div class="tabela-wrap"><table><thead><tr><th>Produto</th><th class="dir">Qtd</th><th class="dir">Valor total</th><th>TES</th><th>NF</th></tr></thead><tbody>${itens}</tbody></table></div></section>

          <section><h3>Linha do tempo</h3><ul class="linha-tempo">${tempo}</ul></section>
        </div>
        <footer class="rodape-gaveta">
          <span class="muted" id="lg-sujo"></span>
          <button type="button" class="btn" data-acao="fechar">Fechar</button>
          <button type="button" class="btn pri" data-acao="salvar" id="lg-salvar">Salvar</button>
        </footer>
      </aside>`;
    this.atualizarForm();
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
      if (k === 'transportadora') {
        const v = el.value.trim();
        out[k] = v.includes(' - ') ? v.split(' - ')[0].trim() : v.toUpperCase();
        return;
      }
      if (NUMEROS.includes(k)) {
        out[k] = numBR(el.value);
        return;
      }
      if (k === 'pedidoReenvio') {
        out[k] = numPedido(el.value);
        return;
      }
      if (k === 'especie') {
        out[k] = el.value.trim().toUpperCase();
        return;
      }
      if (k === 'obsEntrega') {
        // campo caracter (tem tamanho): uma linha so; memo: mantem as quebras
        const txt = el.value.replace(/\r\n?/g, '\n').trim();
        out[k] = this.resp?.tamanhos?.[CAMPO.obsEntrega] ? txt.replace(/\s*\n\s*/g, ' ') : txt;
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
      obsEntrega: (p.obsEntrega || '').replace(/\r\n?/g, '\n').trim(),
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
    if (!ret && RETORNO.some((k) => v[k])) erros.push('Motivo e pedido do reenvio só com a data do retorno.');
    if (v.pedidoReenvio && v.pedidoReenvio === p.pedido) erros.push('O pedido do reenvio tem que ser outro pedido.');
    if (ret && !v.pedidoReenvio) avisos.push('Sem o pedido do reenvio: fica em Retornados como "aguardando reenvio".');
    const tr = v.transportadora || '';
    if (tr && !(p.notas || []).length && !(this.resp?.transportadoras || []).some(([c]) => c === tr)) erros.push(`Transportadora "${tr}" não encontrada no cadastro (escolha na lista).`);
    if (env && !(p.notas || []).length) avisos.push('Pedido sem nota fiscal com data de envio preenchida.');
    if (env && !prev) avisos.push('Falta a previsão de entrega da transportadora: sem ela o pedido não entra no indicador de prazo.');
    const final = v.reentrega === 'S' ? nova : ent;
    if (final && prev && final > prev && !v.indicador) avisos.push('Entrega depois da previsão: escolha o indicador de atraso.');
    if (!final && !ret && prev && prev < iso(this.hoje) && env && !v.indicador) avisos.push('Previsão vencida e sem entrega: escolha o indicador de atraso.');
    if (v.reentrega === 'S' && !nova) avisos.push('Reentrega sem a nova data de entrega: o pedido continua em Enviados até ela ser informada.');
    if (env && !v.cte) avisos.push('Falta o número do CTE.');
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
    if (this.salvando) return;
    this.el.camada.innerHTML = '';
    this.aberto = 0;
  }
  private fecharComConfirmacao(): void {
    const r = this.reg(this.aberto);
    if (r && Object.keys(this.alteracoes(r.p)).length && !confirm('Há alterações não salvas neste pedido. Fechar mesmo assim?')) return;
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
    this.el.camada.querySelectorAll('.modal, .fundo-modal').forEach((x) => x.remove());
  }

  private irPara(tela: string): void {
    this.tela = tela;
    guardar('tela', tela);
    this.e.ord = { k: '', asc: false };
    this.e.limite = 200;
    this.desenhar();
  }

  private consultar(): void {
    const de = dt((this.raiz.querySelector('#lg-de') as HTMLInputElement).value);
    const ate = dt((this.raiz.querySelector('#lg-ate') as HTMLInputElement).value);
    if (!de || !ate || de > ate) {
      this.aviso('Período inválido.', true);
      return;
    }
    this.e.de = de;
    this.e.ate = ate;
    this.api.carregar(iso(de), iso(ate));
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
        const novo = await this.api.salvar(L.recno, L.dados);
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
        else if (a === 'diag') this.abrirDiagnostico();
        else if (a === 'importar') this.abrirImportar();
        else if (a?.startsWith('imp-')) void this.acaoImp(a);
        else if (a === 'sair') this.api.fechar?.();
        else if (a === 'fechar') this.fecharComConfirmacao();
        else if (a === 'fechar-modal') this.fecharModal();
        else if (a === 'salvar') void this.salvar();
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
    raiz.addEventListener('dragstart', (ev) => {
      const c = (ev.target as HTMLElement).closest?.('[data-arrasta]') as HTMLElement | null;
      if (!c || !ev.dataTransfer) return;
      ev.dataTransfer.setData('text/plain', c.dataset['arrasta'] as string);
      ev.dataTransfer.effectAllowed = 'move';
      this.arrastando = Number(c.dataset['arrasta']);
      c.classList.add('arrastando');
    });
    raiz.addEventListener('dragend', (ev) => {
      (ev.target as HTMLElement).classList?.remove('arrastando');
      this.arrastando = 0;
      raiz.querySelectorAll('.kb-col.alvo').forEach((x) => x.classList.remove('alvo'));
    });
    raiz.addEventListener('dragover', (ev) => {
      const col = (ev.target as HTMLElement).closest?.('[data-dia]') as HTMLElement | null;
      if (!col || !this.arrastando) return;
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
      if (!col.classList.contains('alvo')) {
        raiz.querySelectorAll('.kb-col.alvo').forEach((x) => x.classList.remove('alvo'));
        col.classList.add('alvo');
      }
    });
    raiz.addEventListener('drop', (ev) => {
      const col = (ev.target as HTMLElement).closest?.('[data-dia]') as HTMLElement | null;
      if (!col) return;
      ev.preventDefault();
      col.classList.remove('alvo');
      const rec = Number(ev.dataTransfer?.getData('text/plain') || this.arrastando);
      this.arrastando = 0;
      if (rec) void this.programar(rec, col.dataset['dia'] === '-' ? '' : (col.dataset['dia'] as string));
    });

    // Ordem dos quadros e campos da importacao
    raiz.addEventListener('change', (ev) => {
      const t = ev.target as HTMLInputElement;
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
    });

    // Formulario da gaveta: qualquer mudanca reconfere as regras
    this.el.camada.addEventListener('input', (ev) => {
      if (!(ev.target as HTMLElement).closest('#lg-form')) return;
      this.atualizarForm();
    });
    this.el.camada.addEventListener('change', (ev) => {
      if (!(ev.target as HTMLElement).closest('#lg-form')) return;
      this.atualizarForm();
    });
    this.el.camada.addEventListener('submit', (ev) => ev.preventDefault());

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
