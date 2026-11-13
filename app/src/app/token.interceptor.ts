import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ProAppConfigService } from '@totvs/protheus-lib-core';
import { Observable } from 'rxjs';

// Renovacao do token (09/11/2026): quando o token da sessao chega perto de vencer,
// a protheus-lib-core faz POST em "/api/oauth2/v1/token" (caminho relativo) e
// prefixa com serverBackend + restEntryPoint do appConfig, que no TOTVS Cloud ficam
// vazios. A chamada ia para a porta do webapp (ex. 10403), que nao tem essa rota
// nem CORS, e a tela parava com "Sem resposta do servidor REST" depois de um tempo
// aberta. Aqui a renovacao vai para o REST do ambiente (restLogrel), que tem a
// rota /rest/api/oauth2/v1/token (conferido na homologacao: 401 para token
// invalido, CORS liberado). As demais chamadas nao sao alteradas.
const ROTA_TOKEN = /^(?:https?:\/\/[^/]+)?\/api\/oauth2\/v1\/token(?=[?#]|$)/i;

@Injectable()
export class RenovarTokenNoRest implements HttpInterceptor {
  private readonly config = inject(ProAppConfigService);

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const rest = this.restBase();
    if (!rest || !ROTA_TOKEN.test(req.url) || req.url.toLowerCase().startsWith(rest.toLowerCase())) return next.handle(req);
    return next.handle(req.clone({ url: req.url.replace(ROTA_TOKEN, `${rest}/api/oauth2/v1/token`) }));
  }

  /** "restLogrel" do appconfig.json (preenchido pelo empacotar.ps1); '' fora do Protheus */
  private restBase(): string {
    try {
      const c = this.config.proAppConfig as { restLogrel?: string } | null;
      return String(c?.restLogrel ?? '').trim().replace(/\/+$/, '');
    } catch {
      return '';
    }
  }
}
