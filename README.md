# LOGREL - Logística (pedidos de entrega)

Tela Angular + PO UI aberta dentro do Protheus por `U_LOGRELAPP` (`FwCallApp("logrel")`). A logística acompanha os pedidos em cinco etapas (previstos, faturados, enviados, entregues e retornados) e programa as saídas do dia. A edição dos dados de envio, entrega e reentrega é feita na própria tela, que também lança os **custos de frete** de cada pedido (CTE do envio, reentregas e taxas, com a situação de cada cobrança), guarda o **histórico** de quem alterou o quê, imprime o DANFE e traz os indicadores de prazo e de frete × custo.

| | |
|---|---|
| API | `API/RESTLOGREL.tlpp` (TLPP, versão `LG_VERSAO`) |
| Menu | `LOGRELAPP/LOGRELAPP.PRW` (`U_LOGRELAPP`; também recebe da tela o pedido de impressão do DANFE) |
| Tela | `app/`: Angular 21, PO UI 21.36, `@totvs/protheus-lib-core` 21.1.4 |
| Planilha | `planilha/Codigo.gs`: planilha Google que se atualiza sozinha a cada 15 minutos pela mesma API (molde do RX Pedidos) |
| Acesso | pelo menu (`U_LOGRELAPP`); a API não tem trava própria desde 18/11/2026 |
| Criada em | 13/11/2026, no molde do PCPREL (`PO-UI-Protheus-main`) |

## Implantação na produção: por onde começar

Faça tudo **fora do expediente**, nesta ordem. A homologação já está funcionando, e o arquivo dos campos foi exportado em 18/11/2026 (`C:\Protheus\logrelupd_01_20261118.json`).

**1. Criar os campos na SC5**
1. Compile `COMPAT/LOGRELUPD.prw` na produção.
2. Rode `U_LOGRELUPD` pelo menu, com ninguém usando pedidos de venda, e escolha **Importar**.
3. Escolha o arquivo `.json` e confira a prévia. Ela deve mostrar:
   - em "criar", os campos da logística que faltam (até 17);
   - `C5_ZFRETE` em "já existem iguais", porque a tela de pedidos já usa esse campo;
   - a pasta 3 com um nome que faça sentido na tela de pedidos.

   Se algum campo aparecer em "já existe com outra definição", pare e confira. Se `C5_ZTPPEDI` aparecer em "criar", veja antes se a tabela `ZV` existe no SX5.
4. Clique em **Criar**. No resultado, cada campo deve aparecer como "ok" no banco.
5. Todos saem e entram de novo no Protheus.

Detalhes em [Criar os campos na produção](#criar-os-campos-na-produção-compatlogrelupdprw).

**1b. Criar as tabelas de custos de frete (ZLC) e de histórico (ZLH)**, desde 19/11/2026. Fazer primeiro na homologação.
1. Com o `LOGRELUPD.prw` de 19/11 compilado, rode `U_LOGRELUPD` e escolha **Tabelas**. O resultado mostra, para cada tabela, o SX2, os campos, os índices e "existe no banco".
2. Na primeira vez, as tabelas são novas: todos saem e entram de novo no Protheus.
3. Rode `U_LOGRELUPD` → **Tabelas** de novo. Agora ele oferece a **carga inicial**: o CTE e o CTE da reentrega de cada pedido (campos da SC5) viram cobranças de Envio e Reentrega na ZLC. A prévia mostra quantos pedidos e quanto em R$. No fim, a **conferência** compara a soma da SC5 com a soma da ZLC: devem conferir.
4. A carga pode rodar de novo: pedido que já tem cobrança na ZLC fica de fora. Os campos de CTE da SC5 não são alterados nem apagados; ficam parados.

Detalhes em [Custos de frete e histórico](#custos-de-frete-e-histórico-zlc-e-zlh).

**2. Compilar a tela** (veja [Publicar no Protheus](#publicar-no-protheus))
1. Compile `API/RESTLOGREL.tlpp` (versão `2026-11-19c`).
2. Compile `LOGRELAPP/LOGRELAPP.PRW`.
3. Compile `app/dist/producao/logrel.app`. Ele aponta para o REST da produção (porta 10407) e foi gerado do mesmo código da homologação. Se a tela mudar, gere de novo com `empacotar.ps1 -Ambiente producao`.

**3. Dar acesso**
Inclua `U_LOGRELAPP` no menu dos usuários da logística. Não há outra configuração: a API não usa o `VSACESSO` nem o `MV_VSAPUSR`.

**4. Conferir**
1. Abra a tela e clique em **Diagnóstico**. Confira três coisas:
   - o REST é o da porta 10407;
   - a versão da API é `2026-11-19a`;
   - "Campos que faltam na SC5" está vazio.
2. Abra um pedido, grave uma data de envio de teste e apague depois. Imprima o DANFE de um pedido faturado.
3. Num pedido enviado, abra **Custos de frete**: o CTE que estava no pedido aparece como cobrança de Envio. Inclua uma cobrança de teste, marque como Divergente, exclua, e confira tudo em **Histórico de alterações**.
4. O `U_LOGRELUPD` pode rodar de novo, porque só cria o que falta. Se o `X31UpdTable` der erro, o dicionário já está gravado: rode de novo fora do expediente.

## Para que serve

Hoje o PCP define por e-mail os pedidos que saem no dia, um analista preenche a transportadora e a data de saída, o faturamento emite a nota e a logística imprime as notas do e-mail e redigita cada envio na planilha ENVIOS 2026 (59 colunas, cerca de 19 envios por dia). A tela traz do Protheus o que ele já sabe e deixa para a logística só o transporte. Explicação completa, com imagens de dados fictícios, em `..\Comunicados\2026-11-logistica\Logistica - tela no Protheus.pdf`.

## O que a tela faz

**Topo:** busca e filtros. **Busca por pedido** (24/11/2026): digitar só o número de um pedido (até 6 dígitos, com ou sem os zeros) mostra só esse pedido; outros números (NF de 9 dígitos, CTE, série) e textos buscam em todos os campos, como antes. Transportadora, UF, tipo de material, tipo de pedido e situação aceitam mais de uma opção (caixas de marcar). Há um filtro de data por emissão, entrega ou previsão de entrega, o botão "Limpar filtros" e os botões **Atualizar dados**, **Exportar XLSX**, **Importar planilha** e **Diagnóstico**.

**Atualização automática** (24/11/2026, igual ao RX Pedidos): no topo, Desligada / 5 / 10 / 15 min (padrão 5; a escolha fica no navegador). A cada 15 s a tela confere se já passou o tempo e busca os dados sem trocar a tela por "Atualizando…". Não atualiza enquanto há pedido aberto, janela aberta, filtro aberto, gravação em andamento, pedido sendo arrastado ou campo em edição: o status mostra "aguardando: …" e a resposta é aplicada assim que liberar. Se falhar, os dados anteriores ficam na tela e tenta de novo no próximo ciclo. Mantém a rolagem da página e da Programação.

**Exportar XLSX:** abre uma janela para escolher o que sai na planilha: todos os pedidos, previstos, faturados aguardando saída, enviados (em trânsito), entregues, atrasados (em trânsito e entregues com atraso), retornados ou com custo de frete em divergência, cada um com a contagem. Dá para aplicar ou não os filtros do topo e escolher as abas: **Pedidos** (uma linha por pedido, com todos os dados de logística e frete), **Itens** (uma linha por item, com NF e números de série) e **Custos de frete** (uma linha por cobrança). Cada aba sai como tabela do Excel, fonte Tahoma 10, com datas e valores como data e número. O gerador (`xlsx.ts`) é o mesmo do RX Pedidos, já usado dentro do Protheus. A Lista completa continua com o CSV. O Diagnóstico mostra o endereço do REST, a versão da API, o último erro e os campos que faltam na SC5.

O período da consulta saiu do topo em 23/11/2026 (pedido do usuário). A tela carrega os pedidos com NF emitidos de 01/01 do ano anterior até hoje, e todos os sem NF; **Atualizar dados** repete a consulta com a data de hoje.

**Abas:**
- **Quadros:** as colunas das etapas e, logo depois de Pedidos enviados, a coluna **Enviados hoje** (pedidos com data de envio de hoje, em qualquer etapa, com a etapa no cartão; o pedido continua também na coluna da etapa dele). No topo ficam os cartões de alerta. **Todos filtram os quadros ao clicar** (23/11/2026): os quadros mostram só os pedidos do cartão; clicar de novo, ou em "Mostrar todos", tira o filtro. Os cartões:
  - **Com informação faltando:** pedidos com algo para completar (lista abaixo);
  - **Saíram hoje:** pedidos com data de envio de hoje, com unidades e transportadoras.

  Cada coluna também tem um **filtro próprio**, abaixo do seletor de ordem: "Com informação faltando" ou uma informação específica (só aparecem as opções que têm pedido, com a contagem). O cartão ganha o selo amarelo **Falta …**, e a lista completa aparece ao passar o mouse. Com filtro ligado, os Entregues antigos também aparecem, porque é neles que costuma faltar informação.

  | Quadro | Informação faltando |
  |---|---|
  | Previstos | transportadora, volume, espécie, peso líquido ou bruto |
  | Faturados | data de envio, quando a NF tem mais de 2 dias |
  | Enviados | previsão de entrega; data de entrega, com a previsão vencida; nova data da reentrega; CTE do envio; tipo de material; indicador de atraso, quando atrasado |
  | Entregues | previsão de entrega, CTE do envio, tipo de material, indicador de atraso, quando atrasado |
  | Retornados | motivo do retorno, pedido do reenvio |

  Campo que não existe no ambiente não conta. Transportadora, volume, espécie e pesos só contam nos Previstos: com NF eles já saíram no documento e não são alterados pela tela.

  Os outros cartões: em trânsito atrasados, vencem em até 2 dias, faturados parados há mais de 2 dias, sem previsão, sem dados para a NF-e, aguardando reenvio e custo de frete em divergência. O filtro "Situação" tem a opção **Custo de frete em divergência**. Cada coluna tem o próprio seletor de ordem, do mais antigo para o mais novo ou o contrário, e a escolha fica guardada no navegador. Entregues mostra os últimos 30 dias, com opção de ver todos; com texto na busca, ou com um cartão ou filtro de quadro ligado, mostra todos os encontrados, de qualquer data (24/11/2026).
- **Programação:** kanban das saídas por dia pela saída programada (`C5_FECENT`): não saíram, hoje e os próximos dias úteis, depois e sem programação. Arrastar o cartão reprograma; "Saiu" grava a data de envio de hoje; o botão DANFE imprime a nota do cartão. Embaixo, o card das entregas previstas para hoje, com o botão "Entregue". A coluna **Não saíram** tem uma caixa de filtro para digitar, sem opções: pedido, cliente, cidade, transportadora, NF… (a mesma busca do topo). Os cartões do topo (saem hoje, não saíram, entregas previstas hoje, com NF sem programação) levam à coluna ou ao bloco dos pedidos e o destacam.
- **Lista completa:** um item do pedido por linha, com ordenação por coluna e exportação em CSV.
- **Indicadores:**
  - prazo (no prazo × atrasado) e motivos de atraso, com percentual;
  - comparação entre transportadoras: % no prazo, atraso médio, tempo de entrega, custo médio, % reentrega, % com custo em divergência e envios;
  - ranking das transportadoras;
  - frete por transportadora, mensal e anual (custo, cobrado ou pedidos);
  - CTE × frete cobrado, com os 20 piores casos;
  - modelos mais enviados, tipo de material e envios por UF.

**Gaveta do pedido** (clique no cartão ou na linha): dados do pedido e dos itens. No topo, cada NF do pedido com o botão **Imprimir DANFE**, que abre a rotina padrão da SPEDNFE por cima da tela (só dentro do Protheus). A carta de correção continua na SPEDNFE. Na tabela de itens, a linha de cada produto mostra os **números de série** (tabela Z01, como no RX Pedidos), quando houver. O formulário edita, nesta ordem:
- dados do pedido para a NF-e (transportadora, volume, espécie, peso líquido e peso bruto), antes da nota. O frete destacado e o não destacado aparecem só para consulta;
- datas: saída programada (`C5_FECENT`, desde 15/11/2026 não preenche mais a data de envio), envio, previsão da transportadora e entrega, cada uma com o botão "Hoje";
- tipo de material;
- reentrega e indicador de atraso. Com o indicador **Outros** (opção `7=Outros` no combo do `C5_ZINDICA`, desde 24/11/2026), aparece o campo obrigatório "O que aconteceu?";
- observações da entrega (`C5_ZOBS`), texto livre;
- retorno: data, motivo, pedido do reenvio e **observação do retorno** (texto livre, desde 23/11/2026; só com a data do retorno). A observação **não é campo da SC5**: cada gravação vira uma linha da ZLH com o texto no `ZLH_OBS` (veja [Custos de frete e histórico](#custos-de-frete-e-histórico-zlc-e-zlh));
- **finalizar sem entrega** (desde 24/11/2026): a caixa "Pedido finalizado sem data de entrega" encerra o pedido que não vai ter entrega. Pede o motivo (Extravio, Enviado em outro pedido ou Outro motivo) e a data (no extravio, a data do extravio; começa em hoje). Também aceita o pedido que levou a mercadoria (obrigatório em "Enviado em outro pedido") e uma observação (obrigatória em "Outro motivo"). No **extravio** ainda há o reembolso (Pendente, Reembolsado ou Sem reembolso), o valor e a data do reembolso. O pedido vai para a coluna **Retornados e finalizados**, sai da Programação e do % no prazo. Extravio sem reembolso resolvido aparece no cartão **Reembolsos pendentes**. Desmarcar a caixa apaga os dados e devolve o pedido à etapa dele. Também ficam na ZLH, não na SC5.

A gravação envia só o que mudou e fecha a gaveta. O botão "Fechar" pergunta antes se há alteração não salva.

Em "Cliente e pedido" ficam:
- o **telefone** do cadastro (cliente de entrega e, se for outro, o cliente do pedido), com link para discar;
- o **endereço de entrega** (rua, complemento, bairro, cidade/UF e CEP do cliente de entrega; fornecedor na devolução e no beneficiamento), desde 23/11/2026;
- a **mensagem para a nota** (`C5_MENNOTA`), só para leitura, desde 23/11/2026.

Dois blocos de frete e histórico:
- **Custos de frete**, logo abaixo de "Envio e entrega" e sempre visível (pedido do usuário em 19/11/2026): a lista das cobranças do pedido (tipo, CTE ou documento, data, transportadora, valor e situação), com o total. "+ Adicionar cobrança" e "Editar" abrem um formulário curto, que grava na hora sem fechar a gaveta. Tipos: Envio, Reentrega, Armazenagem, Devolução, Outra taxa. Situações: OK, Divergente, Em contato, Ajustado, Aceito como veio. Com Divergente ou Em contato, o "valor esperado" (opcional) mostra a diferença. A exclusão pede confirmação e fica no histórico.
  - **Sem CTE** (24/11/2026, pedido do usuário): caixa de marcar ao lado do CTE. Grava a marca `SEM CTE` no `ZLC_CTE`. Com valor, é frete pago sem CTE; com valor zero, é movimentação interna, sem cobrança. Na tabela aparece "Sem CTE" e, com valor zero, "sem cobrança".
  - **Pendência de CTE:** qualquer cobrança lançada resolve, de qualquer tipo (envio, outra taxa…), com CTE, com texto ou "Sem CTE". Antes, só uma cobrança de Envio contava.
- **Histórico de alterações**, no fim da gaveta e fechado até o clique: quem mudou o quê e quando, no pedido e nas cobranças (antes → depois), marcando o que veio da importação e da carga inicial.

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
| `C5_ZCTE` / `C5_ZVLRCTE` | CTE e valor do CTE | **parados** com a ZLC (19/11/2026): o CTE passa a ser cobrança de Envio |
| `C5_ZREENTR` | Gerou reentrega (Sim/Não) | sim |
| `C5_ZNDENT` | Nova data da reentrega | só com reentrega = Sim |
| `C5_ZCTEREE` / `C5_ZVCTERE` | CTE e valor da reentrega | **parados** com a ZLC: viram cobrança de Reentrega |
| `C5_ZINDICA` | Indicador de atraso (combo do SX3) | sim |
| `C5_ZDTRET` | Data do retorno: a mercadoria voltou para a empresa e o pedido vai para Retornados | sim |
| `C5_ZMOTRET` | Motivo do retorno (combo: 1=Recusa, 2=Endereço, 3=Avaria, 4=Outros) | só com data do retorno |
| `C5_ZPEDREN` | Pedido do reenvio (o novo pedido que leva a mercadoria de novo) | só com data do retorno |
| `C5_ZOBS` | Observações da entrega (texto livre; caracter ou memo) | sim |
| `C5_MENNOTA` | Mensagem para a nota (padrão do Protheus) | não |
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
  - **com NF:** emissão no período da tela e itens com TES de saída que movimenta estoque (`F4_TIPO = 'S'` e `F4_ESTOQUE = 'S'`) em `C5_TIPO = 'N'`, ou item com a **TES 610** (remessa para conserto, usada no início da operação; desde 19/11/2026), ou pedido com data de envio, de qualquer TES ou tipo;
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
- **Frete:** o frete cobrado é `C5_FRETE` + `C5_ZFRETE`. O custo é a soma das cobranças da ZLC (CTE, reentregas e taxas); sem a ZLC no ambiente, CTE + CTE da reentrega da SC5.
- **Gravação:** direto na SC5, com `RecLock`. Pedido aberto por outro usuário responde "em uso".

O detalhe das regras, das decisões e das pendências está no [CLAUDE.md](CLAUDE.md).

## API

| Rota | Uso |
|---|---|
| `GET /api/v1/vs-financial-data/logistica/pedidos?de=AAAAMMDD&ate=AAAAMMDD` | Pedidos do período: padrão de 365 dias, máximo de 1100. A tela pede de 01/01 do ano anterior até hoje. |
| `PUT /api/v1/vs-financial-data/logistica/pedidos/:recno` | Grava os campos enviados no pedido (R_E_C_N_O_ da SC5) e devolve o pedido atualizado. |
| `POST /api/v1/vs-financial-data/logistica/pedidos/busca` | `{"pedidos": [...]}`, até 500: pedidos pelo número, sem filtro (usada pela importação). |
| `POST /api/v1/vs-financial-data/logistica/custos` | `{"recno", "acao": "incluir"\|"alterar"\|"excluir", "item", "tipo", "cte", "data", "transportadora", "valor", "valorEsperado", "situacao", "obs"}`: grava uma cobrança de frete (ZLC) e o histórico; devolve o pedido. |
| `GET /api/v1/vs-financial-data/logistica/historico?pedido=NNNNNN` | Histórico do pedido (ZLH), mais novo primeiro. |
| `GET /api/v1/vs-financial-data/logistica/reversa/diagnostico?meses=24` | Diagnóstico só de leitura da logística reversa (desde `2026-11-24a`): retornos de locação/comodato, ligação com a remessa, equipamentos no cliente, CTEs de entrada e CTEs da ZLC no fiscal. Não grava nada. |

Sem as tabelas ZLC e ZLH no ambiente, a API funciona como antes (CTE na SC5, sem histórico) e o POST de custos responde 409.

**Acesso:** as rotas não têm trava própria desde 18/11/2026 (o `U_VSAPIACE` foi retirado a pedido). O controle é o menu: só quem tem `U_LOGRELAPP` abre a tela. **Erros:** saem no header `X-Erro`, porque o REST descarta o corpo das respostas 500.

## Comunicados

| Pasta | Conteúdo |
|---|---|
| [`Comunicados/2026-11-apresentacao-logistica/`](Comunicados/2026-11-apresentacao-logistica/README.md) | Apresentação da tela (19/11/2026): e-mail pronto para o Gmail (`email-gmail.html`), HTML, texto, PDF, prints com dados fictícios e os scripts para refazer. Explica como foi feito (SC5, custos de frete, histórico), a planilha já no Protheus, a tela aba por aba, a leitura por API (CRM) e o próximo passo (APIs das transportadoras). |

## Planilha Google (`planilha/Codigo.gs`)

Uma planilha Google com os pedidos da logística, que se atualiza sozinha a cada 15 minutos. Ela funciona como a planilha do RX Pedidos (`RX-Pedidos/PCPREL/planilha/Codigo.gs`):
- o Apps Script chama o mesmo `GET /logistica/pedidos` da tela;
- não precisa compilar nada no Protheus.

**Montar a planilha**
1. Crie uma planilha Google e abra **Extensões → Apps Script**. Cole o conteúdo de `planilha/Codigo.gs` e salve.
2. Em **Configurações do projeto**:
   - confira o fuso horário: (GMT-03:00) São Paulo;
   - em **Propriedades do script**, cadastre:

   | Propriedade | Conteúdo |
   |---|---|
   | `PROTHEUS_URL` | Endereço do REST, terminando em `/rest` (produção: porta 10407) |
   | `PROTHEUS_USUARIO` | Usuário do Protheus, de preferência só de leitura (o mesmo da planilha do RX) |
   | `PROTHEUS_SENHA` | Senha desse usuário |
   | `DIAS` | Opcional. Pedidos com NF emitidos nos últimos N dias. Vazio = 365, igual à tela; máximo 1100. Os sem NF vêm todos |

3. Recarregue a planilha e use o menu **Logística → Ligar atualização automática**. Na primeira vez, o Google pede autorização.

**Abas** (regravadas a cada carga, com as mesmas colunas e regras do **Exportar XLSX** da tela)

| Aba | Conteúdo |
|---|---|
| Pedidos | Uma linha por pedido (45 colunas). Começa com Pedido, Saída programada, Envio, Previsão de entrega e Data de entrega (`PRIMEIRAS_PEDIDOS`); depois vêm Quadro, Situação da entrega e as demais colunas, na ordem do Exportar XLSX. As linhas seguem a ordem dos quadros (Previsto, Faturado, Enviado, Entregue, Retornou) e, dentro de cada quadro, o número do pedido. Só as células de Quadro e Situação da entrega são pintadas |
| Itens | Uma linha por item (produto, quantidade, TES, NF, números de série) |
| Custos de frete | Uma linha por cobrança da ZLC (CTE, reentregas, taxas), com a diferença das divergentes. Só aparece com a ZLC no ambiente; sem ela, a aba Pedidos mostra o CTE da SC5 |
| Resumo | Quatro tabelas: pontos de atenção (iguais aos cartões da tela), pedidos por quadro, transportadoras (enviados e entregues, % no prazo, frete cobrado × custo) e entregues por mês da entrega (últimos 12 meses) |
| Atualizacao | As últimas 200 execuções: quando rodou, OK ou ERRO, o detalhe e o tempo. Se der erro, os dados anteriores continuam nas abas |

**Cores**

| Célula | Valor | Cor |
|---|---|---|
| Quadro | Previsto / Faturado / Enviado / Entregue / Retornou | amarelo claro 2 / laranja claro 1 / azul claro 1 / verde escuro 2 (fonte branca) / cinza |
| Situação da entrega | No prazo / Vence em até 2 dias / Atrasado / Sem previsão | verde claro 3 / vermelho claro / vermelho escuro (fonte branca) / sem cor |

**Menu Logística**
- **Atualizar agora:** busca e regrava na hora.
- **Ligar atualização automática:** cria o gatilho e já atualiza uma vez.
- **Desligar atualização automática:** remove o gatilho.

**Cuidados**
- O REST do Protheus precisa ser acessível pela internet, porque o Apps Script roda nos servidores do Google.
- Quem tiver o link vê os valores: itens, frete cobrado e custo de frete.
- Se a tela mudar as regras de quadro, prazo ou frete (`montar` em `painel.ts`) ou as colunas do Exportar XLSX, mude também `montar_` e `colunasPedidos_` no `Codigo.gs`.

## Arquivos da tela (`app/src/app/`)

| Arquivo | Conteúdo |
|---|---|
| `painel.ts` | A tela inteira: quadros, programação, lista, indicadores, gaveta (com os botões da NF) e importação. |
| `importar.ts` | Leitura da planilha: separadores, títulos, datas, números e combos. |
| `log.service.ts` | Chamadas da API (pedidos, custos, histórico) e mensagens de erro. |
| `xlsx.ts` | Gera o .xlsx no navegador, sem biblioteca (cópia do RX Pedidos). |
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

## Criar os campos na produção (`COMPAT/LOGRELUPD.prw`)

Os campos `C5_Z*` foram criados à mão na homologação. O `U_LOGRELUPD` copia a definição de lá, em vez de redigitar:

1. **Na homologação:** compile o `LOGRELUPD.prw`, rode `U_LOGRELUPD` pelo menu e escolha **Exportar**. Ele lê do SX3 todos os campos da SC5 que começam com `C5_Z` e os gatilhos SX7 desses campos. Depois grava `\logrelupd\LOGRELUPD_<empresa>_<data>.json` no servidor e copia esse arquivo para a pasta que você escolher. A tela lista os campos e avisa se faltar algum que a API usa.
2. **Na produção, fora do expediente**, com ninguém usando pedidos de venda: compile o fonte, rode `U_LOGRELUPD` e escolha **Importar**. Escolha o arquivo e confira a prévia:
   - campos a criar;
   - campos que já existem iguais;
   - campos que já existem com outro tipo ou tamanho, que **não são alterados**.
   Confirmado, ele cria os campos que faltam no fim da SC5 (`X3_ORDEM` novo), cria os gatilhos que faltam e roda o `X31UpdTable("SC5")`. Depois confere as colunas no banco.

   Só cria os 17 campos que a API usa (`Esperados()` no fonte) e os gatilhos deles. Os outros `C5_Z*` do arquivo são de outras rotinas, como faturamento e financeiro. Se faltarem na produção, só aparecem listados na prévia.
3. Todos saem e entram de novo no Protheus. Depois disso, publique a API e a tela na produção.

A opção **Tabelas** do mesmo `U_LOGRELUPD` cria a ZLC e a ZLH e faz a carga inicial dos CTEs (veja o passo 1b da implantação).

Pode rodar de novo: só cria o que falta. O arquivo guarda o registro inteiro do SX3, com `X3_USADO`, `X3_RESERV` e `X3_OBRIGAT` codificados, e o texto vai em Base64. Assim a definição chega igual à da homologação.

## Custos de frete e histórico (ZLC e ZLH)

Pedido do usuário em 19/11/2026: a transportadora às vezes manda o CTE com valor diferente do combinado, e o usuário precisa registrar o contato até o ajuste. Um pedido pode ter mais de uma reentrega e outras taxas (armazenagem, por exemplo), e a planilha não é mais importada: só a tela grava.

**ZLC, custos de frete do pedido:** uma linha por cobrança, com a chave filial + pedido (6 dígitos, `C5_NUM`) + item (001, 002…, gerado pela API).

| Campo | Conteúdo |
|---|---|
| `ZLC_TIPO` | E=Envio, R=Reentrega, A=Armazenagem, D=Devolução, O=Outra taxa |
| `ZLC_CTE`, `ZLC_DATA`, `ZLC_TRANSP` | número do CTE ou documento, data, transportadora (começa com a do pedido) |
| `ZLC_VALOR` | valor cobrado pela transportadora |
| `ZLC_SITUA` | vazio = OK; D=Divergente, C=Em contato, A=Ajustado, I=Aceito como veio |
| `ZLC_VLRESP` | valor esperado (opcional, informado à mão: não há cotação no Protheus) |
| `ZLC_OBS` | observação (250 caracteres) |
| `ZLC_CODUSR`, `ZLC_USUARI`, `ZLC_DTALT`, `ZLC_HRALT` | quem alterou por último e quando |

A exclusão é lógica: a linha fica no banco, marcada como excluída, e o número do item não se repete.

**ZLH, histórico da logística:** cada alteração feita pela tela, no pedido (campos da SC5) ou numa cobrança (ZLC). Guarda pedido, item da cobrança (vazio = pedido), data, hora, ação (inclusão, alteração, exclusão), origem (tela, importação, carga inicial), campo, título, valor antes, valor depois e o usuário. Só entra o que mudou de fato. Alteração feita fora da tela (por exemplo, no pedido de venda) não entra.

**Observação do retorno na ZLH** (23/11/2026, pedido do usuário para não criar mais um campo na SC5): o usuário criou o campo `ZLH_OBS` direto no Configurador, sem compatibilizador.
- Cada gravação da observação é uma linha da ZLH: `ZLH_CAMPO = OBSRET`, texto inteiro no `ZLH_OBS` e resumo em antes/depois (`ZLH_VALANT`/`ZLH_VALNOV`, até 250 caracteres), para aparecer no Histórico de alterações.
- A tela mostra a linha mais recente do pedido. Apagar a observação grava uma linha de exclusão com o texto vazio.
- O `ZLH_OBS` pode ser caracter ou memo: a API lê o memo real (BLOB/CLOB) e só limita o tamanho no caracter.
- Sem a ZLH ou sem o `ZLH_OBS` no ambiente, o campo fica desligado na tela e aparece em "Campos que faltam" no Diagnóstico. O `ZLH_OBS` existe nas duas bases (C 250; na produção, conferido pela API em 24/11/2026).

**Finalização sem entrega e indicador "Outros" na ZLH** (API `2026-11-24b`, pedido do usuário: nada de campo novo na SC5). Mesmo caminho da observação do retorno, um `ZLH_CAMPO` por informação, com o valor **cru** no `ZLH_OBS` e o resumo legível em antes/depois para o Histórico. Vale a linha mais recente de cada pedido e campo.

| Chave do PUT/GET | `ZLH_CAMPO` | Valor no `ZLH_OBS` |
|---|---|---|
| `finalizado` | `FINALIZ` | `S` ou vazio |
| `motivoFinal` | `FINMOT` | `E` Extravio, `P` Enviado em outro pedido, `O` Outro motivo |
| `dataFinal` | `FINDATA` | AAAAMMDD |
| `pedidoFinal` | `FINPED` | número do pedido (completa os zeros; existe e é outro) |
| `reembolso` | `REEMB` | `P` Pendente, `S` Reembolsado, `N` Sem reembolso |
| `valorReembolso` | `REEMBVL` | 1234.56 |
| `dataReembolso` | `REEMBDT` | AAAAMMDD |
| `obsFinal` | `FINOBS` | texto |
| `obsIndicador` | `OBSIND` | texto (indicador "Outros") |
| `obsRetorno` | `OBSRET` | texto (desde 23/11/2026) |

Os combos de motivo e reembolso são fixos na API (`FIN_MOTIVOS`, `FIN_REEMB`) e vão em `opcoes.motivoFinal`/`opcoes.reembolso` do GET. Regras do PUT (as mesmas da tela), com erro 400 `FINALIZACAO_INVALIDA` ou `SEM_FINALIZADO`:
- os dados da finalização só valem com `finalizado` = S;
- finalizado exige motivo e data (≥ emissão), e não vale com data do retorno nem com data de entrega;
- extravio exige envio, e a data do extravio tem que ser ≥ envio;
- "Enviado em outro pedido" exige o pedido; "Outro motivo" exige a observação;
- reembolso só no extravio; data do reembolso só com Reembolsado e ≥ extravio.

**Importação por planilha:** continua. O CTE e o valor do envio e da reentrega vão para a 1ª cobrança de Envio e de Reentrega do pedido na ZLC, criada se não existir. O histórico marca essas linhas como importação.

## Envios parciais (ZLE), desde 25/11/2026

Pedido faturado em partes, com o mesmo pedido de venda: **cada NF é um envio**. Pedido do usuário: a logística precisa lançar CTE, frete e as datas de cada envio.

- **O 1º envio** é a NF mais antiga (`nfPrincipal`). Ele continua nos campos de "Envio e entrega" da SC5, como sempre. Pedido de uma NF só não muda nada.
- **Os envios seguintes** ficam na tabela **ZLE (envios do pedido)**, uma linha por NF, com:
  - data de envio, previsão de entrega e data de entrega;
  - tipo de material e indicador de atraso;
  - transportadora do envio, que vem com a da NF (`F2_TRANSP`) e pode ser trocada.

  A observação, a reentrega e o retorno continuam um só por pedido.
- **CTE e frete de cada envio** são cobranças da ZLC com o campo **`ZLC_NF`** (vazio = 1º envio). Valem as mesmas regras: vários CTEs, "Sem CTE", divergência.
- **Gaveta:** o 1º envio fica em "Envio e entrega · 1º envio (NF …)". Cada NF seguinte tem um bloco próprio:
  - mostra os campos acima, a situação do prazo e as cobranças daquele envio;
  - **"+ Cobrança deste envio"** abre o formulário de cobrança já com a NF certa;
  - **"Salvar envio"** grava na hora (`POST /logistica/envios`), sem fechar a gaveta;
  - a tabela de custos ganha a coluna "Envio", e a linha do tempo, as datas de cada envio.
- **Quadros:** o pedido só vai para **Entregues** quando todos os envios forem entregues.
  - Com algum envio em trânsito, fica em **Enviados**.
  - Se nenhum está em trânsito e alguma NF ainda não saiu, fica em **Faturados**.
  - O prazo é o do pior envio, e o cartão mostra o selo "1 de 2 envios".
  - As pendências (data de envio, previsão, CTE, tipo de material, indicador) são conferidas em cada NF.
  - "Saíram hoje" e "Enviados hoje" consideram qualquer envio.
- **Indicadores e XLSX:**
  - os indicadores contam cada envio separado;
  - a Lista mostra, em cada item, as datas e o tipo de material do envio da NF dele;
  - o XLSX e a planilha Google ganharam a aba **Envios**, com uma linha por envio.
- **Dicionário:** a ZLE e o `ZLC_NF` são criados pelo `U_LOGRELUPD`, opção **Tabelas**, que só cria o que falta. Sem eles, a tela mostra os envios seguintes só para consulta e avisa para rodar o compatibilizador.

## Publicar no Protheus

1. Gere o pacote, na pasta `app`: `powershell -ExecutionPolicy Bypass -File .\empacotar.ps1 -Ambiente homologacao`, ou `producao`. O resultado sai em `dist\<ambiente>\logrel.app`. O REST de cada ambiente já está no script (10557 e 10407); `-Rest <url>` troca o endereço.
2. Compile, ou gere o patch, com estes arquivos:
   - `API/RESTLOGREL.tlpp`;
   - `LOGRELAPP/LOGRELAPP.PRW`;
   - o recurso `app/dist/<ambiente>/logrel.app`.
3. Inclua `U_LOGRELAPP` no menu.

Mudança só na tela exige recompilar apenas o `logrel.app`; mudança só na API, apenas o `RESTLOGREL.tlpp`. Cada pasta de patch (`API/`, `LOGRELAPP/`, `app/dist/homologacao/`, `app/dist/producao/`) contém só o arquivo que vai para o RPO: não coloque outros arquivos nelas. O TDS precisa de `.APP` em `totvsLanguageServer.folder.extensionsAllowed` para compilar o pacote.
