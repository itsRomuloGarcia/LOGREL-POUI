# LOGREL — Logística (pedidos de entrega)

Tela PO UI dentro do Protheus para a logística acompanhar e editar os pedidos de entrega. Criada em 13/11/2026 no molde do PCPREL (`PO-UI-Protheus-main`).

| Parte | Arquivo | Vai para o RPO |
|---|---|---|
| API | `API/RESTLOGREL.tlpp` (`getVsLogPedidos`, `putVsLogPedido`), versão `LG_VERSAO` = `2026-11-13a` | sim |
| Menu | `LOGRELAPP/LOGRELAPP.PRW` (`U_LOGRELAPP` → `FwCallApp("logrel")`) | sim |
| Tela | `app/` (Angular 21, PO UI 21.36, `@totvs/protheus-lib-core` 21.1.4) → `app/dist/<ambiente>/logrel.app` | sim (recurso) |
| Acesso | `..\API-Acesso-main\VSACESSO.tlpp` (`U_VSAPIACE`) | sim, se ainda não estiver |

Cada pasta de patch (`API/`, `LOGRELAPP/`, `app/dist/homologacao/`, `app/dist/producao/`) tem só o arquivo que vai para o RPO. Não criar outros arquivos nelas.

## Rotas
- `GET /api/v1/vs-financial-data/logistica/pedidos?de=AAAAMMDD&ate=AAAAMMDD` (padrão 365 dias, máximo 1100). A tela pede 01/01 do ano anterior até hoje.
- `PUT /api/v1/vs-financial-data/logistica/pedidos/:recno` (R_E_C_N_O_ da SC5). Só os campos enviados; responde o pedido no formato do GET.
- As duas chamam `U_VSAPIACE(.T., "U_LOGRELAPP")`: passa quem está no `MV_VSAPUSR` ou tem a rotina no menu (vazio = libera).

## Regras (decisões da 1ª versão, 13/11/2026 — a confirmar com o usuário)
- **Base:** item da SC6 com TES de **saída que movimenta estoque** (`F4_TIPO = 'S'` e `F4_ESTOQUE = 'S'`, SF4 com filial exata), `C5_TIPO = 'N'`, `C6_BLQ <> 'R'`, emissão (`C5_EMISSAO`) no período. Pedido sem item assim não aparece.
- Cliente/loja/nome/grupo pelo `C5_CLIENTE/C5_LOJACLI`; grupo = `ACY_DESCRI` do `A1_GRPVEN` (só a descrição). Cidade/UF pelo cliente de **entrega** (`C5_CLIENT/C5_LOJAENT`).
- **Quadros** (calculados na tela, `montar()` do `painel.ts`):
  - Entregue = data de entrega final preenchida. Entrega final = `C5_ZNDENT` se `C5_ZREENTR` = Sim, senão `C5_ZDTENTR`. Reentrega sem a nova data fica em Enviados.
  - Enviado = `C5_ZDTENV` preenchida.
  - Faturado = algum item com NF real (`C6_NOTA` que não começa com X). NF de parte dos itens = marca "NF parcial".
  - Previsto = o resto.
- **Prazo** (sempre pela previsão da transportadora, `C5_ZDTPREV`): entregue com entrega final > previsão = atrasado; enviado com previsão < hoje = atrasado, até 2 dias = "vence"; sem previsão = fora do % no prazo.
- Frete cobrado = `C5_FRETE` + `C5_ZFRETE`; custo = `C5_ZVLRCTE` + `C5_ZVCTERE`. A comparação CTE × cobrado só usa pedidos com CTE lançado. Indicadores pela data de envio (exceto pontualidade, pelo mês da entrega).
- `C5_ZFRETE` é **caracter**: a API lê com `ValTxt` ("1.234,56", "1234.56", "R$ 150") e grava com ponto decimal ("1234.56"), que o `Val()` das outras APIs (RESTPEDIDOS) entende.
- **Gravação** direta na SC5 com `RecLock` (sem MATA410, sem gatilho/validação do SX3). Regras na API e na tela: envio ≥ emissão; entrega exige envio e ≥ envio; nova entrega ≥ envio; campos de reentrega só com Sim (marcar Não apaga os dados da reentrega); combos só com código do X3_CBOX; texto no tamanho do campo.
- Transportadora, frete destacado, volume e frete não destacado **só editam antes da NF** (409 `PEDIDO_FATURADO`). Decisão minha: depois da NF esses dados já saíram no documento.
- Opções de `C5_ZTPMAT`, `C5_ZINDICA`, `C5_ZREENTR` e `C5_ZTPPEDI` vêm do **X3_CBOX** (não fixas). C5_ZTPMAT: a lista informada tinha T duas vezes; o usuário corrigiu o SX3 em 13/11/2026 para `T=Terminal;P=Periferico;C=Catraca;D=Pedestal` (a lista reserva da tela, `TPMAT_PADRAO`, segue igual).
- Campos novos/opcionais da SC5 são conferidos no `ALL_TAB_COLUMNS` a cada GET: o que falta vira vazio, vai em `camposFaltando` e a tela desliga a edição (coluna inexistente derrubaria a thread do REST).

## Tela (`app/src/app/`)
- `painel.ts`: Quadros (4 colunas + cartões de alerta), Lista completa (um item por linha, ordenação, CSV), Indicadores, gaveta do pedido com o formulário. `graficos.ts` copiado do PCPREL sem mudança (paleta validada).
- `log.service.ts` (GET/PUT, mensagens de erro), `app.ts` (casca, Diagnóstico), `token.interceptor.ts` (renovação do token no REST, igual ao PCPREL), `erros.ts`.
- `styles.css`: o do PCPREL + bloco "Logistica (LOGREL)" no fim.
- Pacote: `powershell -ExecutionPolicy Bypass -File .\empacotar.ps1 -Ambiente homologacao|producao` (em `app/`). Local: `$env:LOGREL_REST` + `$env:LOGREL_AUTH` e `npm start`.
- **13/11/2026 (2ª), pedido do usuário** (tela já funcionando na homologação, com o VSACESSO compilado):
  - Cada quadro tem um seletor de ordem (`ORD_QUADRO`, lembrado no navegador): previstos por emissão (antigos/novos) ou previsão de saída; faturados por NF ou emissão; enviados por previsão de entrega ou envio; entregues por entrega.
  - **Importar planilha** (botão no topo, `importar.ts` + métodos `*Imp` do `painel.ts`): colar do Excel (tabulação) ou CSV (`;`/`,`, UTF-8 ou Windows-1252) → colunas reconhecidas pelo título (`autoMapa`, ajustáveis) → prévia por pedido (antes → depois, erros) → grava com o **mesmo PUT**, um pedido por vez, e mostra o resultado (baixável em CSV). Sem mudança na API.
  - Regras da importação: célula vazia não altera (opção para limpar); pedido sem zeros à esquerda é completado a 6; só pedidos da consulta carregada (fora do período = erro); pedido repetido = erro; datas dd/mm/aaaa, dd/mm/aa, aaaa-mm-dd ou número de série do Excel; combos pelo código ou pela descrição; transportadora pelo código ou nome único; CTE em notação científica = erro; dados de reentrega sem a coluna "Gerou reentrega" marcam Sim; mesmas regras da gaveta (`conferir`).
  - Regra nova na tela (gaveta e importação): reentrega só para pedido com data de envio. **Não está na API.**
- Testado em 13/11/2026 só com API falsa (dados fictícios) e Chrome headless: quadros, gaveta, gravação (PUT só com campos alterados), regras, lista, indicadores, largura de celular, sem erro de JavaScript.

## Pendências
- Homologação funcionando desde 13/11/2026 (VSACESSO, RESTLOGREL, LOGRELAPP e logrel.app compilados). Falta compilar o `logrel.app` com a ordem dos quadros e a importação e testar a importação com a planilha real do usuário.
- Conferir no Diagnóstico se aparece "Campos que faltam na SC5" e se o combo do C5_ZTPMAT chega com D=Pedestal.
- Confirmar com o usuário: base só `C5_TIPO = 'N'`; bloqueio dos dados comerciais depois da NF; regra de atraso com reentrega (conta a nova data); período pela emissão.
- O CSV não foi testado dentro do Protheus (download no navegador embutido), nem o "Escolher arquivo" da importação; colar do Excel não depende disso.
- Ideias não feitas: registrar envio em lote (vários pedidos, mesma data/CTE), log de quem alterou, atualização automática.
