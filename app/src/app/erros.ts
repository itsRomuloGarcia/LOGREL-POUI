import { HttpErrorResponse } from '@angular/common/http';
import { ErrorHandler, Injectable, inject } from '@angular/core';
import { PoNotificationService } from '@po-ui/ng-components';
import { mensagemErro } from './log.service';

// Dentro do Protheus nao ha console: todo erro de JavaScript vira aviso na tela
// e fica guardado para o botao Diagnostico.
export const errosTela: string[] = [];

export function textoErro(e: unknown): string {
  // Promessa rejeitada com erro HTTP (ex.: renovacao do token da lib) aparecia como "[object Object]"
  if (e instanceof HttpErrorResponse) return mensagemErro(e);
  if (e && typeof e === 'object' && 'rejection' in e) return textoErro((e as { rejection: unknown }).rejection);
  if (e instanceof Error) {
    const pilha = (e.stack || '').split('\n').slice(0, 4).join(' | ');
    return `${e.name}: ${e.message}${pilha ? ` [${pilha}]` : ''}`;
  }
  return String(e);
}

@Injectable()
export class ErroNaTela implements ErrorHandler {
  private readonly aviso = inject(PoNotificationService);

  handleError(e: unknown): void {
    console.error(e);
    const txt = textoErro(e);
    errosTela.unshift(`${new Date().toLocaleTimeString('pt-BR')} ${txt}`);
    errosTela.splice(10);
    try {
      this.aviso.error(`Erro na tela: ${txt.slice(0, 200)} (detalhes em Diagnostico)`);
    } catch {
      /* aviso indisponivel: fica so no Diagnostico */
    }
  }
}
