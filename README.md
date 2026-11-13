# LOGREL - Logística (pedidos de entrega)

Tela Angular + PO UI aberta dentro do Protheus por `U_LOGRELAPP` (`FwCallApp("logrel")`). A logística acompanha os pedidos em quatro etapas (previstos, faturados, enviados e entregues). A edição dos dados de envio, entrega, CTE e reentrega é feita na própria tela, que também traz os indicadores de prazo e de frete × CTE.

| | |
|---|---|
| API | `API/RESTLOGREL.tlpp` (TLPP, versão `LG_VERSAO`) |
| Menu | `LOGRELAPP/LOGRELAPP.PRW` (`U_LOGRELAPP`) |
| Tela | `app/`: Angular 21, PO UI 21.36, `@totvs/protheus-lib-core` 21.1.4 |
| Acesso | `U_VSAPIACE` (`..\API-Acesso-main\VSACESSO.tlpp`) + parâmetro `MV_VSAPUSR` |
| Criada em | 13/11/2026, no molde do PCPREL (`PO-UI-Protheus-main`) |

## O que a tela faz

**Topo:** filtros (busca, transportadora, UF, tipo de material, tipo de pedido, situação do prazo e período de emissão) e os botões **Atualizar dados**, **Importar planilha** e **Diagnóstico**. O Diagnóstico mostra o endereço do REST, a versão da API, o último erro e os campos que faltam na SC5.

**Abas:**
- **Quadros:** as quatro colunas, com cartões de alerta no topo (em trânsito atrasados, vencem em até 2 dias, faturados parados há mais de 2 dias, sem previsão). Cada coluna tem o próprio seletor de ordem, do mais antigo para o mais novo ou o contrário, e a escolha fica guardada no navegador. Entregues mostra os últimos 30 dias, com opção de ver todos.
- **Lista completa:** um item do pedido por linha, com ordenação por coluna e exportação em CSV.
- **Indicadores:**
  - prazo (no prazo × atrasado) e motivos de atraso;
  - ranking das transportadoras;
  - frete por transportadora, mensal e anual (custo, cobrado ou pedidos);
  - CTE × frete cobrado, com os 20 piores casos;
  - modelos mais enviados, tipo de material e envios por UF.

**Gaveta do pedido** (clique no cartão ou na linha): dados do pedido e dos itens. O formulário edita:
- datas: envio, previsão da transportadora e entrega, cada uma com o botão "Hoje";
- tipo de material, CTE e valor;
- reentrega e indicador de atraso;
- dados comerciais (transportadora, frete, volume e frete não destacado).

A gravação envia só o que mudou.

**Importar planilha** (atualização em massa):
1. Cole as células do Excel, com a linha de títulos, ou escolha um CSV.
2. As colunas são reconhecidas pelo título ("Nº Pedido", "Vlr CTE", "Previsão Entrega"…) e podem ser ajustadas. Há um modelo para baixar.
3. A prévia mostra, por pedido, o valor atual → o novo valor, ou o motivo do erro. Nada é gravado antes de "Gravar".
4. Os pedidos são gravados um a um, pela mesma rota da gaveta. No fim aparece o resultado, que pode ser baixado em CSV.

Na importação, a célula vazia não altera nada; há uma opção para que ela apague o valor gravado. O pedido pode vir sem os zeros à esquerda. As datas aceitas são dd/mm/aaaa e dd/mm/aa, e os valores, 1.234,56. Os combos aceitam o código ou a descrição, e a transportadora, o código ou o nome. O pedido precisa estar no período carregado na tela. Formate a coluna de CTE como texto no Excel: CTE em notação científica (1,23E+11) é recusado.

## Campos da SC5

| Campo | Na tela | Edita |
|---|---|---|
| `C5_ZDTENV` | Data de envio | sim |
| `C5_ZDTPREV` | Previsão de entrega da transportadora | sim |
| `C5_ZDTENTR` | Data de entrega | sim |
| `C5_ZTPMAT` | Tipo de material (combo do SX3: T, P, C, D) | sim |
| `C5_ZCTE` / `C5_ZVLRCTE` | CTE e valor do CTE | sim |
| `C5_ZREENTR` | Gerou reentrega (Sim/Não) | sim |
| `C5_ZCTEREE` / `C5_ZVCTERE` / `C5_ZNDENT` | CTE, valor e nova data da reentrega | só com reentrega = Sim |
| `C5_ZINDICA` | Indicador de atraso (combo do SX3) | sim |
| `C5_TRANSP`, `C5_FRETE`, `C5_VOLUME1`, `C5_ZFRETE` | Transportadora, frete, volume, frete não destacado | só antes da NF |
| `C5_ZTPPEDI` | Tipo de pedido | não |

- As opções dos combos vêm do `X3_CBOX`. Para mudar uma opção, ajuste o SX3; a tela acompanha sem recompilar.
- `C5_ZFRETE` é caracter. A API lê "1.234,56", "1234.56" ou "R$ 150" e grava com ponto decimal.
- Campo que não existe na base aparece em "Campos que faltam na SC5" no Diagnóstico e fica sem edição. A API não cai por isso.

## Regras principais

- **Pedidos considerados:** os itens com TES de saída que movimenta estoque (`F4_TIPO = 'S'` e `F4_ESTOQUE = 'S'`), `C5_TIPO = 'N'`, não eliminados por resíduo e com emissão no período.
- **Cliente e grupo:** cliente, loja e grupo (descrição do `A1_GRPVEN`) vêm do cliente do pedido. Cidade e UF vêm do cliente de **entrega**.
- **Etapa do pedido:**
  - Entregue: tem a entrega final. A entrega final é a nova data, se houve reentrega; senão, a data de entrega.
  - Enviado: tem data de envio.
  - Faturado: algum item tem NF. Se só parte dos itens tem NF, o pedido é marcado como "NF parcial".
  - Previsto: os demais.
- **Prazo:** é medido sempre pela previsão da transportadora.
- **Datas:** o envio não pode ser anterior à emissão. A entrega exige envio e não pode ser anterior a ele. Reentrega só vale para pedido com data de envio (regra da tela).
- **Frete:** o frete cobrado é `C5_FRETE` + `C5_ZFRETE`, e o custo, CTE + CTE da reentrega.
- **Gravação:** direto na SC5, com `RecLock`. Pedido aberto por outro usuário responde "em uso".

O detalhe das regras, das decisões e das pendências está no [CLAUDE.md](CLAUDE.md).

## API

| Rota | Uso |
|---|---|
| `GET /api/v1/vs-financial-data/logistica/pedidos?de=AAAAMMDD&ate=AAAAMMDD` | Pedidos do período: padrão de 365 dias, máximo de 1100. A tela pede de 01/01 do ano anterior até hoje. |
| `PUT /api/v1/vs-financial-data/logistica/pedidos/:recno` | Grava os campos enviados no pedido (R_E_C_N_O_ da SC5) e devolve o pedido atualizado. |

**Acesso:** as duas rotas chamam `U_VSAPIACE(.T., "U_LOGRELAPP")`. Passa quem está no `MV_VSAPUSR` ou tem `U_LOGRELAPP` no menu. Com o parâmetro vazio, o acesso é livre. **Erros:** saem no header `X-Erro`, porque o REST descarta o corpo das respostas 500.

## Arquivos da tela (`app/src/app/`)

| Arquivo | Conteúdo |
|---|---|
| `painel.ts` | A tela inteira: quadros, lista, indicadores, gaveta e importação. |
| `importar.ts` | Leitura da planilha: separadores, títulos, datas, números e combos. |
| `log.service.ts` | Chamadas GET/PUT e mensagens de erro. |
| `graficos.ts` | Gráficos (copiado do PCPREL). |
| `app.ts` | Casca: carga e Diagnóstico. |
| `token.interceptor.ts` | Renova o token pelo REST do ambiente. |
| `erros.ts` | Erros de JavaScript. |
| `src/styles.css` | Visual da tela: base do PCPREL mais o bloco "Logistica (LOGREL)". |

## Desenvolvimento local

```powershell
cd app
npm ci
$env:LOGREL_REST = "https://servidor:porta/rest"   # REST da homologação
$env:LOGREL_AUTH = "usuario:senha"                 # só na sessão, nunca no código
npm start                                          # http://localhost:4200
```

O `proxy.conf.cjs` repassa `/api` para `LOGREL_REST` com Basic Auth.

## Publicar no Protheus

1. Gere o pacote, na pasta `app`: `powershell -ExecutionPolicy Bypass -File .\empacotar.ps1 -Ambiente homologacao`, ou `producao`. O resultado sai em `dist\<ambiente>\logrel.app`. O REST de cada ambiente já está no script (10557 e 10407); `-Rest <url>` troca o endereço.
2. Compile, ou gere o patch, com estes arquivos:
   - `API/RESTLOGREL.tlpp`;
   - `LOGRELAPP/LOGRELAPP.PRW`;
   - o recurso `app/dist/<ambiente>/logrel.app`;
   - o `VSACESSO.tlpp`, se ainda não estiver no RPO.
3. Inclua `U_LOGRELAPP` no menu e, se for o caso, o usuário no `MV_VSAPUSR`.

Mudança só na tela exige recompilar apenas o `logrel.app`; mudança só na API, apenas o `RESTLOGREL.tlpp`. Cada pasta de patch (`API/`, `LOGRELAPP/`, `app/dist/homologacao/`, `app/dist/producao/`) contém só o arquivo que vai para o RPO: não coloque outros arquivos nelas. O TDS precisa de `.APP` em `totvsLanguageServer.folder.extensionsAllowed` para compilar o pacote.
