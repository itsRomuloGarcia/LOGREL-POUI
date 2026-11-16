# LOGREL - Logística (pedidos de entrega)

Tela Angular + PO UI aberta dentro do Protheus por `U_LOGRELAPP` (`FwCallApp("logrel")`). A logística acompanha os pedidos em cinco etapas (previstos, faturados, enviados, entregues e retornados) e programa as saídas do dia. A edição dos dados de envio, entrega, CTE e reentrega é feita na própria tela, que também imprime o DANFE e traz os indicadores de prazo e de frete × CTE.

| | |
|---|---|
| API | `API/RESTLOGREL.tlpp` (TLPP, versão `LG_VERSAO`) |
| Menu | `LOGRELAPP/LOGRELAPP.PRW` (`U_LOGRELAPP`; também recebe da tela o pedido de impressão do DANFE) |
| Tela | `app/`: Angular 21, PO UI 21.36, `@totvs/protheus-lib-core` 21.1.4 |
| Acesso | `U_VSAPIACE` (`..\API-Acesso-main\VSACESSO.tlpp`) + parâmetro `MV_VSAPUSR` |
| Criada em | 13/11/2026, no molde do PCPREL (`PO-UI-Protheus-main`) |

## Para que serve

Hoje o PCP define por e-mail os pedidos que saem no dia, um analista preenche a transportadora e a data de saída, o faturamento emite a nota e a logística imprime as notas do e-mail e redigita cada envio na planilha ENVIOS 2026 (59 colunas, cerca de 19 envios por dia). A tela traz do Protheus o que ele já sabe e deixa para a logística só o transporte. Explicação completa, com imagens de dados fictícios, em `..\Comunicados\2026-11-logistica\Logistica - tela no Protheus.pdf`.

## O que a tela faz

**Topo:** busca e filtros. Transportadora, UF, tipo de material, tipo de pedido e situação aceitam mais de uma opção (caixas de marcar). Há um filtro de data por emissão, entrega ou previsão de entrega, o botão "Limpar filtros" e o período da consulta ao Protheus (emissão dos pedidos com NF), e os botões **Atualizar dados**, **Importar planilha** e **Diagnóstico**. O Diagnóstico mostra o endereço do REST, a versão da API, o último erro e os campos que faltam na SC5.

**Abas:**
- **Quadros:** as colunas das etapas, com cartões de alerta no topo (em trânsito atrasados, vencem em até 2 dias, faturados parados há mais de 2 dias, sem previsão, sem dados para a NF-e, aguardando reenvio). Cada coluna tem o próprio seletor de ordem, do mais antigo para o mais novo ou o contrário, e a escolha fica guardada no navegador. Entregues mostra os últimos 30 dias, com opção de ver todos.
- **Programação:** kanban das saídas por dia pela saída programada (`C5_FECENT`): não saíram, hoje e os próximos dias úteis, depois e sem programação. Arrastar o cartão reprograma; "Saiu" grava a data de envio de hoje; o botão DANFE imprime a nota do cartão. Embaixo, o card das entregas previstas para hoje, com o botão "Entregue".
- **Lista completa:** um item do pedido por linha, com ordenação por coluna e exportação em CSV.
- **Indicadores:**
  - prazo (no prazo × atrasado) e motivos de atraso, com percentual;
  - comparação entre transportadoras: % no prazo, atraso médio, tempo de entrega, custo médio do CTE, % reentrega e envios;
  - ranking das transportadoras;
  - frete por transportadora, mensal e anual (custo, cobrado ou pedidos);
  - CTE × frete cobrado, com os 20 piores casos;
  - modelos mais enviados, tipo de material e envios por UF.

**Gaveta do pedido** (clique no cartão ou na linha): dados do pedido e dos itens. No topo, cada NF do pedido com o botão **Imprimir DANFE**, que abre a rotina padrão da SPEDNFE por cima da tela (só dentro do Protheus). A carta de correção continua na SPEDNFE. Na tabela de itens, a linha de cada produto mostra os **números de série** (tabela Z01, como no RX Pedidos), quando houver. O formulário edita, nesta ordem:
- dados do pedido para a NF-e (transportadora, volume, espécie, peso líquido e peso bruto), antes da nota. O frete destacado e o não destacado aparecem só para consulta;
- datas: saída programada (`C5_FECENT`, desde 15/11/2026 não preenche mais a data de envio), envio, previsão da transportadora e entrega, cada uma com o botão "Hoje";
- tipo de material, CTE e valor;
- reentrega e indicador de atraso;
- observações da entrega (`C5_ZOBS`), texto livre;
- retorno: data, motivo e pedido do reenvio.

A gravação envia só o que mudou e fecha a gaveta. O botão "Fechar" pergunta antes se há alteração não salva.

**Importar planilha** (atualização em massa):
1. Cole as células do Excel, com a linha de títulos, ou escolha um CSV.
2. As colunas são reconhecidas pelo título ("Nº Pedido", "Vlr CTE", "Previsão Entrega"…) e podem ser ajustadas. Há um modelo para baixar. A planilha atualiza só estes campos: pedido, data de envio, previsão de entrega, data de entrega, tipo de material, CTE, valor do CTE, gerou reentrega, CTE e valor do CTE da reentrega e indicador de atraso. As outras colunas são ignoradas. A nova data da reentrega e os dados comerciais só mudam pela gaveta, mas com reentrega = Sim e sem nova data a importação usa a data de entrega como nova data, e o pedido fica como entregue. Tipo de material ou indicador que não existe no combo não é gravado (aviso na prévia), e o resto da linha grava normalmente.
3. A prévia mostra, por pedido, o valor atual → o novo valor, ou o motivo do erro. Nada é gravado antes de "Gravar".
4. Os pedidos são gravados um a um, pela mesma rota da gaveta. No fim aparece o resultado, que pode ser baixado em CSV.

Na importação, a célula vazia não altera nada; há uma opção para que ela apague o valor gravado. O pedido pode vir sem os zeros à esquerda. As datas aceitas são dd/mm/aaaa e dd/mm/aa, e os valores, 1.234,56. Os combos aceitam o código ou a descrição. O pedido pode ser qualquer um do Protheus: o que não está carregado na tela é buscado pelo número, sem filtro de período, TES ou tipo, e passa a aparecer depois de gravado. Formate a coluna de CTE como texto no Excel: CTE em notação científica (1,23E+11) é recusado.

## Campos da SC5

| Campo | Na tela | Edita |
|---|---|---|
| `C5_FECENT` | Saída programada (põe o pedido na aba Programação; não preenche o envio) | sim |
| `C5_ZDTENV` | Data de envio | sim |
| `C5_ZDTPREV` | Previsão de entrega da transportadora | sim |
| `C5_ZDTENTR` | Data de entrega | sim |
| `C5_ZTPMAT` | Tipo de material (combo do SX3: T, P, C, D) | sim |
| `C5_ZCTE` / `C5_ZVLRCTE` | CTE e valor do CTE | sim |
| `C5_ZREENTR` | Gerou reentrega (Sim/Não) | sim |
| `C5_ZCTEREE` / `C5_ZVCTERE` / `C5_ZNDENT` | CTE, valor e nova data da reentrega | só com reentrega = Sim |
| `C5_ZINDICA` | Indicador de atraso (combo do SX3) | sim |
| `C5_ZDTRET` | Data do retorno: a mercadoria voltou para a empresa e o pedido vai para Retornados | sim |
| `C5_ZMOTRET` | Motivo do retorno (combo: 1=Recusa, 2=Endereço, 3=Avaria, 4=Outros) | só com data do retorno |
| `C5_ZPEDREN` | Pedido do reenvio (o novo pedido que leva a mercadoria de novo) | só com data do retorno |
| `C5_ZOBS` | Observações da entrega (texto livre; caracter ou memo) | sim |
| `C5_TRANSP`, `C5_VOLUME1`, `C5_ESPECI1`, `C5_PESOL`, `C5_PBRUTO` | Transportadora, volume, espécie, peso líquido, peso bruto | só antes da NF |
| `C5_FRETE`, `C5_ZFRETE` | Frete destacado, frete não destacado | só consulta (desde 15/11/2026) |
| `C5_ZTPPEDI` | Tipo de pedido | não |
| `Z01_SERIE` (tabela Z01) | Números de série do item, com a NF (`Z01_NFEDO`) | não |

- As opções dos combos vêm do `X3_CBOX`. Para mudar uma opção, ajuste o SX3; a tela acompanha sem recompilar.
- `C5_ZFRETE` é caracter. A API lê "1.234,56", "1234.56" ou "R$ 150" e grava com ponto decimal.
- Campo que não existe na base aparece em "Campos que faltam na SC5" no Diagnóstico e fica sem edição. A API não cai por isso.

## Regras principais

- **Pedidos considerados** (itens não eliminados por resíduo):
  - **sem NF:** todos, de qualquer TES, tipo e emissão (os Previstos são todos os pedidos não faturados);
  - **com NF:** emissão no período da tela e itens com TES de saída que movimenta estoque (`F4_TIPO = 'S'` e `F4_ESTOQUE = 'S'`) em `C5_TIPO = 'N'`, ou pedido com data de envio, de qualquer TES ou tipo;
  - **nunca:** itens de remessa por conta e ordem (CFOP 5923/6923). O transporte sai em outro pedido.
- **Cliente e grupo:** cliente, loja e grupo (descrição do `A1_GRPVEN`) vêm do cliente do pedido. Cidade e UF vêm do cliente de **entrega**.
- **Etapa do pedido:**
  - Entregue: tem a entrega final. A entrega final é a nova data, se houve reentrega; senão, a data de entrega.
  - Enviado: tem data de envio.
  - Faturado: algum item tem NF. Se só parte dos itens tem NF, o pedido é marcado como "NF parcial".
  - Previsto: os demais.
  - Retornado (vem antes de todas): tem data do retorno. Sem o pedido do reenvio, aparece como "aguardando reenvio".
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
| `POST /api/v1/vs-financial-data/logistica/pedidos/busca` | `{"pedidos": [...]}`, até 500: pedidos pelo número, sem filtro (usada pela importação). |

**Acesso:** as duas rotas chamam `U_VSAPIACE(.T., "U_LOGRELAPP")`. Passa quem está no `MV_VSAPUSR` ou tem `U_LOGRELAPP` no menu. Com o parâmetro vazio, o acesso é livre. **Erros:** saem no header `X-Erro`, porque o REST descarta o corpo das respostas 500.

## Arquivos da tela (`app/src/app/`)

| Arquivo | Conteúdo |
|---|---|
| `painel.ts` | A tela inteira: quadros, programação, lista, indicadores, gaveta (com os botões da NF) e importação. |
| `importar.ts` | Leitura da planilha: separadores, títulos, datas, números e combos. |
| `log.service.ts` | Chamadas GET/PUT e mensagens de erro. |
| `graficos.ts` | Gráficos (copiado do PCPREL). |
| `app.ts` | Casca: carga, Diagnóstico e chamada do DANFE (`jsToAdvpl` → `JsToAdvpl` do `LOGRELAPP.PRW`). |
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
