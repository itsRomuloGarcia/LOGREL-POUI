import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import {
  ApplicationConfig,
  ErrorHandler,
  importProvidersFrom,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { PoModule } from '@po-ui/ng-components';
import { ProAppConfigService, ProtheusLibCoreModule } from '@totvs/protheus-lib-core';
import { ErroNaTela } from './erros';
import { RenovarTokenNoRest } from './token.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: ErroNaTela },
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideAnimations(),
    // O FwCallApp abre ".../index.html": sem rota, o Angular acusava NG04002.
    // A tela nao usa rotas (as abas sao internas do Painel); aceita qualquer caminho.
    provideRouter([{ path: '**', children: [] }]),
    // withInterceptorsFromDi: os interceptors da protheus-lib-core (URL do REST,
    // token do usuario, empresa/filial) sao registrados via HTTP_INTERCEPTORS
    provideHttpClient(withInterceptorsFromDi()),
    importProvidersFrom(PoModule, ProtheusLibCoreModule),
    // Depois dos da lib: a renovacao do token vai para o REST, nao para o webapp
    { provide: HTTP_INTERCEPTORS, useClass: RenovarTokenNoRest, multi: true },
    // Le assets/data/appConfig.json e, dentro do Protheus, a sessao do FwCallApp.
    // Fora do Protheus (npm start) segue sem ela e o proxy do dev server atende.
    provideAppInitializer(() =>
      inject(ProAppConfigService)
        .loadAppConfig()
        .catch((e) => console.warn('appConfig nao carregado', e)),
    ),
  ],
};
