import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, map, Observable, of, shareReplay, switchMap } from 'rxjs';

// API ../API/RESTLOGREL.tlpp (GET e PUT /logistica/pedidos).
// Endereco do REST: "restLogrel" do assets/data/appconfig.json, preenchido pelo
// empacotar.ps1 (ex.: https://xxx.protheus.cloudtotvs.com.br:10557/rest). No
// TOTVS Cloud o FwCallApp informa a porta do broker do webapp, que nao e o REST
// (aprendido no PCPREL, 05/11/2026). URL absoluta: a protheus-lib-core nao
// reescreve, mas continua mandando o token do usuario e empresa/filial.
// Vazio (npm start): caminho relativo, atendido pelo proxy.conf.cjs.
const CAMINHO = '/api/v1/vs-financial-data/logistica/pedidos';

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
  vendedor: string;
  codVendedor: string;
  tipoPedido: string;
  previsaoSaida: string;
  transportadora: string;
  transportadoraNome: string;
  frete: number;
  freteNaoDestacadoTexto: string;
  freteNaoDestacado: number;
  volume: number;
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
  itens: ItemPedido[];
  notas: string[];
  dataFaturamento: string;
}

export type Opcao = [string, string];

export interface LogResposta {
  versao: string;
  geradoEm: string;
  de: string;
  ate: string;
  /** Campos da SC5 que ainda nao existem no ambiente (vem vazios e nao editam) */
  camposFaltando: string[];
  opcoes: { tipoMaterial: Opcao[]; indicador: Opcao[]; reentrega: Opcao[]; tipoPedido: Opcao[] };
  tamanhos: Record<string, number>;
  transportadoras: Opcao[];
  total: number;
  pedidos: Pedido[];
}

/** Corpo do PUT: so os campos alterados. Datas AAAA-MM-DD, '' limpa */
export interface PedidoEdicao {
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
  transportadora?: string;
  frete?: number;
  volume?: number;
  freteNaoDestacado?: number;
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

  salvar(recno: number, dados: PedidoEdicao): Observable<Pedido> {
    return this.baseRest$.pipe(switchMap((b) => this.http.put<Pedido>(`${b}${CAMINHO}/${recno}`, dados)));
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
