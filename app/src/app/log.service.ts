import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, map, Observable, of, shareReplay, switchMap } from 'rxjs';

// API ../API/RESTLOGREL.tlpp (GET e PUT /logistica/pedidos; POST /logistica/custos e
// GET /logistica/historico desde a 2026-11-19a).
// Endereco do REST: "restLogrel" do assets/data/appconfig.json, preenchido pelo
// empacotar.ps1 (ex.: https://xxx.protheus.cloudtotvs.com.br:10557/rest). No
// TOTVS Cloud o FwCallApp informa a porta do broker do webapp, que nao e o REST
// (aprendido no PCPREL, 05/11/2026). URL absoluta: a protheus-lib-core nao
// reescreve, mas continua mandando o token do usuario e empresa/filial.
// Vazio (npm start): caminho relativo, atendido pelo proxy.conf.cjs.
const CAMINHO = '/api/v1/vs-financial-data/logistica/pedidos';
const LOGISTICA = '/api/v1/vs-financial-data/logistica';

/** Cobranca de frete do pedido (tabela ZLC): CTE do envio, reentrega, armazenagem, taxas. API >= 2026-11-19a */
export interface Custo {
  item: string;
  /** E envio, R reentrega, A armazenagem, D devolucao, O outra taxa (X3_CBOX do ZLC_TIPO) */
  tipo: string;
  cte: string;
  data: string;
  transportadora: string;
  transportadoraNome: string;
  valor: number;
  /** '' = ok; D divergente, C em contato, A ajustado, I aceito como veio */
  situacao: string;
  valorEsperado: number;
  obs: string;
  usuario: string;
  alteradoEm: string;
  /** NF do envio (ZLC_NF, API >= 2026-11-25a); vazio = envio principal */
  nf?: string;
}

/** Envio de uma NF do pedido depois da 1a (tabela ZLE, API >= 2026-11-25a) */
export interface EnvioNf {
  nf: string;
  serie: string;
  /** emissao da NF */
  dataFat: string;
  /** transportadora da NF (F2_TRANSP) */
  transportadoraNf: string;
  /** ja tem linha na ZLE */
  gravado: boolean;
  dataEnvio: string;
  dataPrevisao: string;
  dataEntrega: string;
  tipoMaterial: string;
  indicador: string;
  transportadora: string;
  usuario: string;
  alteradoEm: string;
}

/** Corpo do POST /logistica/envios (so os campos alterados) */
export interface EnvioEdicao {
  recno: number;
  nf: string;
  serie: string;
  dataEnvio?: string;
  dataPrevisao?: string;
  dataEntrega?: string;
  tipoMaterial?: string;
  indicador?: string;
  transportadora?: string;
}

/** Corpo do POST /logistica/custos */
export interface CustoEdicao {
  recno: number;
  acao: 'incluir' | 'alterar' | 'excluir';
  item?: string;
  tipo?: string;
  cte?: string;
  data?: string;
  transportadora?: string;
  valor?: number;
  valorEsperado?: number;
  situacao?: string;
  obs?: string;
  /** NF do envio (vazio = envio principal) */
  nf?: string;
}

/** Linha do historico da logistica (tabela ZLH) */
export interface HistLinha {
  data: string;
  hora: string;
  /** item da cobranca (ZLC); vazio = campo do pedido (SC5) */
  item: string;
  /** I inclusao, A alteracao, E exclusao */
  acao: string;
  /** 1 tela, 2 importacao, 3 carga inicial */
  origem: string;
  campo: string;
  titulo: string;
  de: string;
  para: string;
  codUsuario: string;
  usuario: string;
}

export interface ItemPedido {
  item: string;
  produto: string;
  descricao: string;
  quantidade: number;
  entregue: number;
  valor: number;
  tes: string;
  descTes: string;
  nota: string;
  serie: string;
  dataFat: string;
  /** Numeros de serie da Z01 do item, com e sem NF: [serie, nf]. API >= 2026-11-16a (antes: ausente) */
  numerosSerie?: [string, string][];
}

/** Datas em AAAA-MM-DD ('' = vazia). reentrega = 'SIM' | 'NAO' | '' */
export interface Pedido {
  recno: number;
  pedido: string;
  emissao: string;
  cliente: string;
  loja: string;
  nome: string;
  fantasia: string;
  grupo: string;
  clienteEntrega: string;
  nomeEntrega: string;
  cidade: string;
  uf: string;
  /** Telefone do cliente de entrega e do cliente do pedido (A1_DDD + A1_TEL); API >= 2026-11-19c */
  telefone?: string;
  telefoneCliente?: string;
  vendedor: string;
  codVendedor: string;
  tipoPedido: string;
  /** C5_TIPO (N normal, D devolucao, B beneficiamento, C/I/P complementos); API >= 2026-11-13b */
  tipoNf?: string;
  previsaoSaida: string;
  transportadora: string;
  transportadoraNome: string;
  frete: number;
  freteNaoDestacadoTexto: string;
  freteNaoDestacado: number;
  volume: number;
  /** Dados da NF-e, preenchidos antes da emissao: C5_ESPECI1, C5_PESOL, C5_PBRUTO; API >= 2026-11-15a */
  especie?: string;
  pesoLiquido?: number;
  pesoBruto?: number;
  dataEnvio: string;
  dataPrevisao: string;
  dataEntrega: string;
  tipoMaterial: string;
  cte: string;
  valorCte: number;
  reentrega: string;
  cteReentrega: string;
  valorCteReentrega: number;
  dataNovaEntrega: string;
  indicador: string;
  /** Mercadoria voltou para a empresa (sera reenviada em outro pedido); API >= 2026-11-13e */
  dataRetorno?: string;
  motivoRetorno?: string;
  pedidoReenvio?: string;
  /** C5_ZOBS: observacoes da entrega (texto livre); API >= 2026-11-15b */
  obsEntrega?: string;
  /** Observacao do retorno a empresa: ultima linha OBSRET da ZLH (ZLH_OBS); API >= 2026-11-23b */
  obsRetorno?: string;
  /** Finalizado sem data de entrega (extravio, enviado em outro pedido, outro motivo):
   *  linhas da ZLH, nao campos da SC5 (pedido do usuario); API >= 2026-11-24b */
  finalizado?: string;
  /** E extravio, P enviado em outro pedido, O outro motivo */
  motivoFinal?: string;
  dataFinal?: string;
  /** pedido em que a mercadoria foi (reenvio) */
  pedidoFinal?: string;
  /** extravio: P pendente, S reembolsado, N sem reembolso */
  reembolso?: string;
  valorReembolso?: number;
  dataReembolso?: string;
  obsFinal?: string;
  /** o que aconteceu, quando o indicador de atraso e "Outros" (ZLH) */
  obsIndicador?: string;
  /** C5_MENNOTA: mensagem para a nota (so leitura); API >= 2026-11-23a */
  mensagemNota?: string;
  /** Endereco do cliente de entrega (A1_END, A1_COMPLEM, A1_BAIRRO, A1_CEP; A2_* na devolucao); API >= 2026-11-23a */
  enderecoEntrega?: string;
  complementoEntrega?: string;
  bairroEntrega?: string;
  cepEntrega?: string;
  /** Cobrancas de frete (ZLC); so com a tabela criada (API >= 2026-11-19a) */
  custos?: Custo[];
  /** Gravou, mas o historico (ZLH) falhou */
  avisoHistorico?: string;
  itens: ItemPedido[];
  notas: string[];
  dataFaturamento: string;
  /** Envios parciais (API >= 2026-11-25a): a NF do 1o envio (campos da SC5) e os envios das outras NFs */
  nfPrincipal?: string;
  envios?: EnvioNf[];
}

export type Opcao = [string, string];

export interface LogResposta {
  versao: string;
  geradoEm: string;
  de: string;
  ate: string;
  /** Campos da SC5 que ainda nao existem no ambiente (vem vazios e nao editam) */
  camposFaltando: string[];
  opcoes: { tipoMaterial: Opcao[]; indicador: Opcao[]; reentrega: Opcao[]; tipoPedido: Opcao[]; motivoRetorno?: Opcao[]; tipoCusto?: Opcao[]; situacaoCusto?: Opcao[]; motivoFinal?: Opcao[]; reembolso?: Opcao[] };
  /** Tabela de custos de frete (ZLC) existe: o CTE sai da SC5 e vira lista de cobrancas */
  temCustos?: boolean;
  /** Tabela de historico (ZLH) existe */
  temHistorico?: boolean;
  /** Tabela de envios parciais (ZLE) existe e a cobranca tem a NF do envio (ZLC_NF) */
  temEnvios?: boolean;
  temNfCusto?: boolean;
  tamanhos: Record<string, number>;
  transportadoras: Opcao[];
  total: number;
  pedidos: Pedido[];
}

/** Corpo do PUT: so os campos alterados. Datas AAAA-MM-DD, '' limpa */
export interface PedidoEdicao {
  /** C5_FECENT = saida PROGRAMADA (aba Programacao). Desde a API 2026-11-15b nao copia para o envio */
  previsaoSaida?: string;
  dataEnvio?: string;
  dataPrevisao?: string;
  dataEntrega?: string;
  tipoMaterial?: string;
  cte?: string;
  valorCte?: number;
  reentrega?: string;
  cteReentrega?: string;
  valorCteReentrega?: number;
  dataNovaEntrega?: string;
  indicador?: string;
  dataRetorno?: string;
  motivoRetorno?: string;
  pedidoReenvio?: string;
  transportadora?: string;
  /** Frete destacado/nao destacado: so consulta desde 15/11/2026 (a API nao grava mais) */
  frete?: number;
  volume?: number;
  freteNaoDestacado?: number;
  especie?: string;
  pesoLiquido?: number;
  pesoBruto?: number;
  obsEntrega?: string;
  /** Observacao do retorno (grava uma linha na ZLH): so com a data do retorno (API >= 2026-11-23b) */
  obsRetorno?: string;
  /** Finalizacao sem entrega e descricao do indicador "Outros": linhas da ZLH (API >= 2026-11-24b) */
  finalizado?: string;
  motivoFinal?: string;
  dataFinal?: string;
  pedidoFinal?: string;
  reembolso?: string;
  valorReembolso?: number;
  dataReembolso?: string;
  obsFinal?: string;
  obsIndicador?: string;
}

@Injectable({ providedIn: 'root' })
export class LogService {
  private readonly http = inject(HttpClient);

  /** Base do REST (sem barra no fim) ou '' para caminho relativo */
  readonly baseRest$: Observable<string> = this.http
    // mesmo nome que a lib usa; o empacotar.ps1 troca para minusculo no pacote
    .get<{ restLogrel?: string }>('assets/data/appConfig.json')
    .pipe(
      map((c) => String(c?.restLogrel ?? '').trim().replace(/\/+$/, '')),
      catchError(() => of('')),
      shareReplay(1),
    );

  /** de / ate em AAAA-MM-DD */
  buscar(de: string, ate: string): Observable<LogResposta> {
    const params = new HttpParams().set('de', de.replace(/-/g, '')).set('ate', ate.replace(/-/g, ''));
    return this.baseRest$.pipe(switchMap((b) => this.http.get<LogResposta>(b + CAMINHO, { params })));
  }

  /** Pedidos pelo numero, sem filtro de periodo/TES/tipo (importacao). API >= 2026-11-13c */
  buscarPedidos(pedidos: string[]): Observable<{ versao: string; pedidos: Pedido[]; naoEncontrados: string[] }> {
    return this.baseRest$.pipe(switchMap((b) => this.http.post<{ versao: string; pedidos: Pedido[]; naoEncontrados: string[] }>(`${b}${CAMINHO}/busca`, { pedidos })));
  }

  /** origem 'importacao' marca o historico (ZLH) como importacao */
  salvar(recno: number, dados: PedidoEdicao, origem?: string): Observable<Pedido> {
    const corpo = origem ? { ...dados, origem } : dados;
    return this.baseRest$.pipe(switchMap((b) => this.http.put<Pedido>(`${b}${CAMINHO}/${recno}`, corpo)));
  }

  /** Inclui, altera ou exclui uma cobranca de frete; responde o pedido como o GET */
  salvarCusto(dados: CustoEdicao): Observable<Pedido> {
    return this.baseRest$.pipe(switchMap((b) => this.http.post<Pedido>(`${b}${LOGISTICA}/custos`, dados)));
  }

  /** Grava o envio de uma NF do pedido (ZLE); responde o pedido como o GET */
  salvarEnvio(dados: EnvioEdicao): Observable<Pedido> {
    return this.baseRest$.pipe(switchMap((b) => this.http.post<Pedido>(`${b}${LOGISTICA}/envios`, dados)));
  }

  historico(pedido: string): Observable<{ temHistorico: boolean; historico: HistLinha[] }> {
    const params = new HttpParams().set('pedido', pedido);
    return this.baseRest$.pipe(switchMap((b) => this.http.get<{ temHistorico: boolean; historico: HistLinha[] }>(`${b}${LOGISTICA}/historico`, { params })));
  }
}

/** Tira tokens da URL antes de mostrar (o Diagnostico costuma ser copiado e colado) */
export function semToken(url: string): string {
  return url.replace(/([?&](?:refresh_token|access_token|token)=)[^&#\s]*/gi, '$1***');
}

/** Mensagem legivel do erro ({"error":{"code","message"}} ou header X-Erro) */
export function mensagemErro(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (/\/api\/oauth2\/v1\/token/i.test(err.url || '')) {
      return `A sessão do Protheus expirou e não foi possível renová-la (HTTP ${err.status}). Feche a tela e abra de novo pelo menu. URL: ${semToken(err.url || '')}`;
    }
    if (err.status === 403) {
      const corpo403 = err.error as { error?: { message?: string } } | null;
      return `Sem permissão para esta tela no servidor. ${corpo403?.error?.message || ''} Peça a inclusão do seu usuário no MV_VSAPUSR ou da rotina U_LOGRELAPP no seu menu.`;
    }
    const corpo = err.error as { error?: { message?: string } } | null;
    const msg = corpo?.error?.message || err.headers?.get('X-Erro');
    if (msg) return msg;
    const url = err.url ? ` URL: ${semToken(err.url)}` : '';
    if (err.status === 0) return `Sem resposta do servidor REST (rede, CORS ou endereço).${url}`;
    if (err.status === 404) return `Rota não encontrada no servidor (o RESTLOGREL foi compilado neste ambiente?).${url}`;
    return `Erro ${err.status} ${err.statusText || ''} ao consultar o Protheus.${url}`;
  }
  return String(err);
}
