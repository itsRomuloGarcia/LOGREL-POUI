import { HttpErrorResponse } from '@angular/common/http';
import { AfterViewInit, Component, ElementRef, inject, OnDestroy, ViewChild } from '@angular/core';
import { ProAppConfigService, ProJsToAdvplService } from '@totvs/protheus-lib-core';
import { firstValueFrom, Subscription } from 'rxjs';
import { errosTela } from './erros';
import { LogService, mensagemErro, semToken } from './log.service';
import { Painel } from './painel';

function isoHoje(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Casca Angular: chama a API pelo HttpClient (a protheus-lib-core poe o token
// do usuario e a empresa/filial) e entrega os dados ao Painel, que desenha a tela.
@Component({
  selector: 'app-root',
  template: '<div #raiz></div>',
})
export class App implements AfterViewInit, OnDestroy {
  private readonly log = inject(LogService);
  private readonly proConfig = inject(ProAppConfigService);
  private readonly advpl = inject(ProJsToAdvplService);
  @ViewChild('raiz', { static: true }) raiz!: ElementRef<HTMLElement>;
  private painel!: Painel;
  private consulta?: Subscription;
  private ultimoErro = '';
  private versaoApi = '';
  private faltando: string[] = [];

  ngAfterViewInit(): void {
    const ate = isoHoje();
    // Padrao: 01/01 do ano anterior ate hoje (acumulado anual com comparacao)
    const de = `${Number(ate.slice(0, 4)) - 1}-01-01`;
    this.painel = new Painel(
      this.raiz.nativeElement,
      {
        carregar: (d, a) => this.carregar(d, a),
        salvar: (r, d) => this.guardarErro('Salvar pedido', firstValueFrom(this.log.salvar(r, d))),
        buscarPedidos: (n) => this.guardarErro('Buscar pedidos', firstValueFrom(this.log.buscarPedidos(n))).then((r) => r?.pedidos || []),
        mensagemErro: (e) => mensagemErro(e),
        diagnostico: () => firstValueFrom(this.log.baseRest$).then((b) => this.diagnostico(b)),
        fechar: this.dentroProtheus() ? () => this.proConfig.callAppClose() : null,
        // DANFE e carta de correcao: o LOGRELAPP.PRW (JsToAdvpl) chama as rotinas padrao da SPEDNFE
        nota: this.dentroProtheus() ? (acao, d) => this.advpl.jsToAdvpl(acao, JSON.stringify(d)) : null,
      },
      de,
      ate,
    );
    this.carregar(de, ate);
  }

  ngOnDestroy(): void {
    this.consulta?.unsubscribe();
  }

  /** Guarda o erro de gravacao (status, URL e corpo da resposta) para o Diagnostico */
  private guardarErro<T>(acao: string, p: Promise<T>): Promise<T> {
    return p.catch((e: unknown) => {
      let corpo = '';
      if (e instanceof HttpErrorResponse) {
        corpo = ` | HTTP ${e.status} ${semToken(e.url ?? '')} | corpo: ${typeof e.error === 'string' ? e.error : JSON.stringify(e.error)}`.slice(0, 600);
      }
      this.ultimoErro = `${new Date().toLocaleTimeString('pt-BR')} ${acao}: ${mensagemErro(e)}${corpo}`;
      throw e;
    });
  }

  private dentroProtheus(): boolean {
    try {
      return this.proConfig.insideProtheus();
    } catch {
      return false;
    }
  }

  private carregar(de: string, ate: string): void {
    this.consulta?.unsubscribe();
    this.painel.marcarCarregando();
    this.consulta = this.log.buscar(de, ate).subscribe({
      next: (r) => {
        this.versaoApi = r.versao || '(sem versao)';
        this.faltando = r.camposFaltando || [];
        this.painel.definirDados(r);
      },
      error: (e) => {
        this.ultimoErro = `${new Date().toLocaleTimeString('pt-BR')} Consulta: ${mensagemErro(e)}`;
        this.painel.marcarErro(mensagemErro(e));
      },
    });
  }

  /** Sem console no Protheus: mostra o que a protheus-lib-core recebeu do FwCallApp */
  private diagnostico(baseRest: string): string {
    const ler = (f: () => unknown) => {
      try {
        const v = f();
        return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
      } catch (e) {
        return `(erro: ${e})`;
      }
    };
    const ss = (k: string) => ler(() => sessionStorage.getItem(k));
    return [
      `Pagina: ${location.href}`,
      `Dentro do Protheus (insideProtheus): ${ler(() => this.proConfig.insideProtheus())}`,
      `REST usado pela tela (restLogrel): ${baseRest || '(vazio - caminho relativo)'}`,
      `Base do REST da lib (serverWithApiUrl): ${ler(() => this.proConfig.serverWithApiUrl)}`,
      `Navegador: ${navigator.userAgent}`,
      `Tamanho da janela: ${window.innerWidth} x ${window.innerHeight}`,
      `Versao do RESTLOGREL no REST: ${this.versaoApi || '(ainda nao carregou)'}`,
      `Campos que faltam na SC5: ${this.faltando.length ? this.faltando.join(', ') : '(nenhum)'}`,
      `Ultimo erro do servidor: ${this.ultimoErro || '(nenhum)'}`,
      `Erros de JavaScript (${errosTela.length}):`,
      ...(errosTela.length ? errosTela.map((e) => '  ' + e) : ['  (nenhum)']),
      '',
      `ERPAPPCONFIG: ${ss('ERPAPPCONFIG')}`,
      `ProCompany: ${ss('ProCompany')}`,
      `ProBranch: ${ss('ProBranch')}`,
      `ERPTOKEN presente: ${sessionStorage.getItem('ERPTOKEN') ? 'sim' : 'nao'}`,
    ].join('\n');
  }
}
