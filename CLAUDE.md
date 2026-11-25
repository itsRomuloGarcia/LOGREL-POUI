# LOGREL — Logística (pedidos de entrega)

Tela PO UI dentro do Protheus para a logística acompanhar e editar os pedidos de entrega. Criada em 13/11/2026 no molde do PCPREL (`PO-UI-Protheus-main`).

| Parte | Arquivo | Vai para o RPO |
|---|---|---|
| API | `API/RESTLOGREL.tlpp` (`getVsLogPedidos`, `putVsLogPedido`, `postVsLogBusca`, `postVsLogCusto`, `getVsLogHistorico`, `getVsLogRevDiag`, `postVsLogEnvio`), versão `LG_VERSAO` = `2026-11-25a` | sim |
| Tabelas | `COMPAT/LOGRELUPD.prw` (`U_LOGRELUPD`): campos `C5_Z*` (Exportar/Importar) e, desde 19/11/2026, as tabelas ZLC/ZLH (opção Tabelas + carga inicial) | sim |
| Menu | `LOGRELAPP/LOGRELAPP.PRW` (`U_LOGRELAPP` → `FwCallApp("logrel")`) | sim |
| Tela | `app/` (Angular 21, PO UI 21.36, `@totvs/protheus-lib-core` 21.1.4) → `app/dist/<ambiente>/logrel.app` | sim (recurso) |
| Acesso | só o menu (`U_LOGRELAPP`). O `U_VSAPIACE` saiu da API em 18/11/2026 (`2026-11-18a`) | não |
| Planilha | `planilha/Codigo.gs` (Apps Script colado na planilha Google; a versão viva é a do Apps Script) | não |

Cada pasta de patch (`API/`, `LOGRELAPP/`, `app/dist/homologacao/`, `app/dist/producao/`) tem só o arquivo que vai para o RPO. Não criar outros arquivos nelas.

## Estações e Git (ler antes de mexer)

Decisão do usuário em 17/11/2026: o repositório `itsRomuloGarcia/LOGREL-POUI` é a **única fonte**. As duas estações trabalham num clone dele, e a sincronização é só pelo Git, igual ao RX Pedidos.

| Estação | Pasta |
|---|---|
| Trabalho | `C:\totvs\LOGREL-POUI` (clone desde 17/11/2026; a cópia de zip `LOGREL-POUI-main` foi apagada) |
| Casa | `C:\Users\Trabalho\Documents\Videosoft\LOGREL-POUI` (clone desde 18/11/2026; a cópia `LOGREL-main` sem `.git` foi conferida e apagada) |

**Sempre, nas duas estações:**
- Antes de mexer, rodar `git pull`.
- Depois de cada atualização (fonte, pacote `logrel.app`, CLAUDE.md, README), fazer commit e push no `origin/main` **na hora, sem pedir confirmação**. No fim, avisar o hash do commit.
- Não enviar mais arquivos pela página do GitHub ("Add files via upload"). Foi isso que deixou as estações desencontradas até 16/11.
- Nunca commitar credenciais (`.env`, `servers.json`, tokens, senhas). Também ficam fora do Git `Planilhas/` (dados reais da base), `node_modules/`, `.angular/` e `*.ptm`. A lista está no `.gitignore`.
- Os arquivos vieram do upload com CRLF. Não normalizar o fim de linha do repositório inteiro, porque isso gera um diff enorme sem mudança real.

**Migração na casa (feita em 18/11/2026; mantida como referência):**
1. Procurar a cópia antiga do LOGREL em `Documents\Videosoft` ou no lugar de onde foram feitos os uploads. Ela é uma pasta **sem `.git`**, por exemplo `LOGREL-POUI-main`.
2. Clonar o repositório em `Documents\Videosoft\LOGREL-POUI`. Se a pasta já existir com `.git`, só rodar `git pull`.
3. Comparar a cópia antiga com o clone, arquivo por arquivo:
   - ignorar a diferença de fim de linha (CRLF × LF);
   - ignorar `node_modules`, `.angular` e `app/dist/app`;
   - conferir a `LG_VERSAO` do `API/RESTLOGREL.tlpp`.
   - **Se a cópia antiga tiver algo mais novo que o Git**, levar para o clone, fazer commit e push **antes** de apagar qualquer coisa. Na dúvida, perguntar ao usuário.
4. Mover a pasta `Planilhas/` para dentro do clone; ela continua fora do Git. Se o `package-lock.json` for igual, também pode mover o `app/node_modules`. Senão, rodar `npm ci` em `app/`.
5. Apagar a cópia antiga, depois de olhar o que tem nela.
6. Gravar na memória do Claude da casa, que é separada da memória do trabalho:
   - a nova pasta;
   - a regra de pull, commit e push automáticos para este repositório.
7. Nesta seção, trocar "**migração pendente**" por "clone desde DD/MM/AAAA", e fazer commit e push.

## Fluxo da logística (contado pelo usuário em 15/11/2026)

1. O **PCP** decide quais pedidos saem no dia e manda a lista por e-mail para o faturamento e para a logística.
2. Um **analista** preenche a transportadora e a data de saída de cada pedido.
3. O **faturamento** emite a nota fiscal.
4. A **logística** abre o e-mail, imprime as notas fiscais e preenche a planilha ENVIOS 2026 (Google Sheets, 59 colunas, cerca de 19 envios por dia) pedido a pedido.

A tela substitui o passo 4: a data de saída (`C5_FECENT`) põe o pedido na aba Programação, o DANFE sai pelo botão do pedido e a logística lança só o transporte. A importação da ENVIOS 2026 o usuário vai fazer depois, pela própria tela.

**Documento explicativo** (para gestão e logística, imagens com dados fictícios): Claude Docs https://claude.ai/artifact/KdzWZkxgyB1P2AEbh2tXNz e PDF em `..\Comunicados\2026-11-logistica\Logistica - tela no Protheus.pdf`, gerado do `documento.html` da mesma pasta (padrão do comunicado RX Pedidos; Chrome headless, A4, escala 0,8).

**Comunicado de apresentação da tela** (19/11/2026, e-mail no padrão do RX Pedidos, prints com dados fictícios): `Comunicados/2026-11-apresentacao-logistica/` **no Git** (pedido do usuário: o comunicado fica no repositório com todos os elementos; a pasta antiga em `Documents\Videosoft\Comunicados\` foi movida para cá) (`email.html`, `email-gmail.html` com as imagens dentro, `email.txt`, PDF). Abre com o texto do usuário ("exterminar" a dependência de planilhas), explica SC5 + ZLC + ZLH, a planilha já no Protheus com Importação/Carga inicial no histórico, a tela aba por aba, a API para outras ferramentas (CRM dos vendedores) e o próximo passo: APIs das transportadoras (rastreio e cotação). Para refazer: `_gerador/` (API falsa `mock2.cjs`, roteiros `passos-prints.mjs` e `passos-entregue.mjs`, `gerar_log.py`) e o `README.md` da pasta. Depois da 1ª versão entrou o print do quadro "Entregas previstas para hoje" com o botão **Entregue** (`02b-entregas-hoje.png`), que o usuário notou que faltava.

## Rotas
- `GET /api/v1/vs-financial-data/logistica/pedidos?de=AAAAMMDD&ate=AAAAMMDD` (padrão 365 dias, máximo 1100). A tela pede 01/01 do ano anterior até hoje.
- `PUT /api/v1/vs-financial-data/logistica/pedidos/:recno` (R_E_C_N_O_ da SC5). Só os campos enviados; responde o pedido no formato do GET, sempre (busca pelo número, sem filtro).
- `POST /api/v1/vs-financial-data/logistica/custos` (`2026-11-19a`): incluir/alterar/excluir uma cobrança da ZLC; responde o pedido como o GET (+ `itemCusto`, `avisoHistorico` se o histórico falhar). 409 `SEM_TABELA_CUSTOS` sem a ZLC.
- `GET /api/v1/vs-financial-data/logistica/historico?pedido=NNNNNN` (`2026-11-19a`): linhas da ZLH, mais novas primeiro.
- `POST /api/v1/vs-financial-data/logistica/pedidos/busca` `{"pedidos": [...]}` (até 500): pedidos pelo número, **sem filtro** de período, TES, tipo ou resíduo; responde `{versao, pedidos, naoEncontrados}`. A importação usa para os pedidos da planilha que não vieram no GET (lotes de 400). Criada em 13/11/2026 (`2026-11-13c`), depois que o usuário recebeu "Pedido fora da consulta" e pediu que a importação "aceite todos".
- **Sem trava de acesso na API** desde `2026-11-18a`. Pedido do usuário em 18/11/2026: "tire isso desse fonte VSACESSO ... as próximas APIs, não coloque, pergunte antes". Até a `2026-11-16a` as três rotas chamavam `U_VSAPIACE(.T., "U_LOGRELAPP")` (`MV_VSAPUSR` ou rotina no menu). **Não recolocar.** Em API nova, perguntar antes de pôr qualquer trava.

## Regras (decisões da 1ª versão, 13/11/2026 — a confirmar com o usuário)
- **Base** (API `2026-11-13b`): item da SC6 com `C6_BLQ <> 'R'` e
  - pedido **sem NF** em nenhum item (`NOT EXISTS` de `C6_NOTA` real): **todos**, de qualquer TES, `C5_TIPO` e emissão. Pedido do usuário em 13/11/2026: "Previstos tem que mostrar TODOS os pedidos não faturados da tela do pedido de vendas". Devolução/beneficiamento (D/B) pega nome, cidade e UF da SA2, e a tela mostra uma etiqueta com o tipo (`tipoNf`, `TIPO_NF`).
  - pedido **com NF**: emissão no período e (item com TES de saída que movimenta estoque (`F4_TIPO = 'S'` e `F4_ESTOQUE = 'S'`, SF4 com filial exata) em `C5_TIPO = 'N'`, **ou** pedido com `C5_ZDTENV` preenchido, de qualquer TES ou tipo (`2026-11-13c`), para que o importado apareça). O período da tela ("Emissão (pedidos com NF)") só vale para estes.
  - Antes (`2026-11-13a`): todos os pedidos passavam pelo filtro de TES, `C5_TIPO = 'N'` e período.
  - **Fora sempre** (`2026-11-13d`): item de remessa por conta e ordem, `SUBSTR(C6_CF,2,3) = '923'` (5923/6923). Segundo o usuário (13/11/2026), esse pedido é só fiscal e o transporte sai em outro pedido. Só no GET: a `/busca` da importação continua sem filtro, e o pedido gravado por ela não aparece na tela. Conferido em 13/11/2026 (`Planilhas/export.csv`, TES × CFOP dos pedidos de 2026): é a **TES 612** (`REMESSA MERCADORIA P/ CONTA E ORDEM TERC. VENDA ORDEM`), 6923 (14 pedidos) e 5923 (2). A venda à ordem correspondente é a TES 523 / 6118 (estoque N, 14 pedidos) e **não** foi excluída: perguntar ao usuário. Também entram nos Previstos, se estiverem sem NF: TES 550 (simples faturamento de venda futura, 5922/6922, estoque N, cerca de 308 pedidos/ano) e TES 560 (serviço ISSQN 5933/6933).
  - **Retornados** (`2026-11-13e`, pedido do usuário em 13/11/2026: "a mercadoria volta para a empresa e é enviada de novo em outra ocasião, com outro pedido"):
    - Campos novos e opcionais da SC5, que o usuário cria no SX3: `C5_ZDTRET` (data), `C5_ZMOTRET` (combo `1=Recusa;2=Endereco;3=Avaria;4=Outros`, também em `MOTRET_PADRAO`) e `C5_ZPEDREN` (pedido do reenvio, C 6). Escolhidos pelo usuário: sem CTE da devolução.
    - 5ª etapa `ret`, com prioridade sobre todas (data do retorno → Retornados, mesmo com entrega). A coluna ordena "aguardando reenvio primeiro" por padrão. Há o cartão de alerta "Aguardando reenvio", e a gaveta mostra "Reenvio do pedido X" no pedido novo.
    - Regras (tela e API): retorno exige envio e retorno ≥ envio; motivo e pedido só com a data (apagar a data limpa os dois); o pedido do reenvio existe na SC5 (`ExistePedido`, por SQL para não tirar a SC5 do registro), é outro pedido e o número é completado com zeros.
    - Retornado não entra no % no prazo (etapa ≠ entregue). Os indicadores não ganharam gráfico de retornos.
    - Os quadros passaram para 5 colunas (3 até 1500px, 2 até 1200px, 1 no celular). Não foi testado na tela.
  - Pedido sem NF mas com data de envio continua em Enviados (a etapa segue entregue > enviado > faturado > previsto).
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
- Transportadora, volume, espécie, peso líquido e peso bruto **só editam antes da NF** (409 `PEDIDO_FATURADO`): depois da NF esses dados já saíram no documento. Frete destacado e não destacado são **só consulta** desde 15/11/2026 (ver abaixo).
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
- **13/11/2026 (3ª), pedido do usuário:** a importação só atualiza **Pedido, data de envio, previsão de entrega, data de entrega, tipo de material, CTE, valor do CTE, gerou reentrega, valor do CTE da reentrega e indicador de atraso** (`DA_PLANILHA` / `DESTINOS_IMP` no `importar.ts`). O resto (CTE e nova data da reentrega, transportadora, frete, volume, frete não destacado) só pela gaveta. As regras de título desses campos continuam no `REGRAS` para "segurar" a coluna: sem elas "CTE Reentrega" cairia em "Gerou reentrega" e "Nova Data Entrega" em "Data de entrega". O `DESTINOS` completo segue para os rótulos (`ROTULO`) da gaveta. `transpDe` removido (só a importação usava).
  - Consequência: pedido com reentrega = Sim só vira Entregue com a nova data (`C5_ZNDENT`), que agora só entra pela gaveta.
- **13/11/2026 (4ª), pedido do usuário depois de subir a 1ª carga:**
  - A importação mapeia também o **CTE da reentrega** (`cteReentrega` no `DA_PLANILHA`).
  - **Reentrega = Sim sem nova data** → nova data = data de entrega, e o pedido vai para Entregues. Fica no `montarPrevia`, com aviso na prévia. Para quem já subiu, basta reimportar a mesma planilha: só a nova data, o CTE da reentrega e o indicador mudam.
  - O combo (material/indicador) sem a opção vira **aviso**: o campo não muda e o resto da linha grava. Antes a linha inteira era recusada.
  - O `opcaoDe` agora reconhece pelas palavras (sem "de/do/da"). Com a lista reserva `INDICA_PADRAO`, 5 das 10 descrições da planilha casam: Atraso, Ausência, Divergência de endereço, Entrega agendada e Extravio (353 de 374 linhas). Material retido, Cliente trocou endereço, Loja em obra, Problema no CNPJ e Divergência de cubagem só casam se existirem no X3_CBOX real do `C5_ZINDICA` (não conferido daqui).
  - `Planilhas/LOGÍSTICA2.xlsx`: a aba "ENVIOS 2026" é igual à atualizada, mais a coluna "Indicador". Gerou `LOGISTICA2-importar.xlsx` (3.509 linhas, 11 colunas; simulação 3.509 ok, 90 com nova data = entrega, 331 indicadores ok com a lista reserva) e `LOGISTICA2-analise.xlsx` (as mesmas 150 linhas). A aba "Página56" é outro controle (QEPTA, NF, CFOP, OTIF…), com pedidos 30xxx–31xxx (= QEPTA). Ficou de fora: os 12 pedidos ≥ 30000 da planilha devem ser esse número, não o C5_NUM.
- **Planilha real** (`Planilhas/LOGISTICA.xlsx`, aba "ENVIOS 2026", 3.709 linhas, conferida em 13/11/2026): títulos `Pedido | Data de Envio | Prev. Entrega | Data de Entrega | Material | Depto. | CTE | Valor CTE | CTE Reentrega | Valor CTE Reentrega`. **Não tem** "Gerou reentrega" nem "Indicador de atraso" (reentrega = Sim sai do valor do CTE da reentrega). Pedido sem zeros (9 a 4.762; um 30961, provável erro de digitação).
  - Corrigido: "Prev. Entrega" caía em Data de entrega (regra `previs` → `prev`); `semValor()` lê "--", "-", "Não atende" como vazio, com aviso na prévia (antes, "--" ia para o CTE em ~250 pedidos); `numPedido` aceita "2604.".
  - Simulação (texto como o Excel copia + funções do `importar.ts`): 3.560 linhas ok e 149 com erro (94 pedidos repetidos, 41 materiais fora do combo, como Bobina, Insumos, Tubos, BALCÃO, CABINE e BASE CATRACA, 10 entregas antes do envio e 4 datas inválidas). Não confere emissão nem se o pedido está na consulta (precisa do Protheus).
  - Versão do usuário `Planilhas/LOGÍSTICA-atualizada.xlsx` (3.659 linhas, sem Depto., com "Gerou reentrega", materiais só T/P/C/D) separada em 13/11/2026: `LOGISTICA-importar.xlsx` (3.509 linhas, títulos do modelo, pedido e CTE como texto, "Não atende" → vazio; simulação 3.509 ok) e `LOGISTICA-analise.xlsx` (150 linhas / 85 pedidos, coluna Motivo: todas as linhas de pedido repetido, datas inválidas ou fora de 2025-2026, entrega ou previsão antes do envio, pedido ≥ 10000, CTE "G" e `6584120"`).
- Testado em 13/11/2026 só com API falsa (dados fictícios) e Chrome headless: quadros, gaveta, gravação (PUT só com campos alterados), regras, lista, indicadores, largura de celular, sem erro de JavaScript.

- **13/11/2026 (5ª), ajustes pedidos pelo usuário:**
  - **Gaveta:** salvar fecha a gaveta. O "Descartar" virou **Fechar** (pergunta se há alteração não salva).
  - **`C5_FECENT` editável** ("Data de saída (C5_FECENT)", chave `previsaoSaida`). Preencher a data copia o mesmo valor para a data de envio (`sincronizarSaida`, com um destaque rápido no campo). A API `2026-11-13f` faz o mesmo quando o corpo traz a data de saída sem `dataEnvio`.
  - **Indicadores:**
    - Motivos dos atrasos com % (`G.barras` ganhou `sub` e escala fixa opcional).
    - Card novo, **Comparação entre transportadoras** (`COMPARA`): % no prazo, atraso médio, tempo de entrega, custo médio do CTE (só pedidos com CTE), % reentrega e envios. A escolha fica no navegador (`compara`). O agregado `porTransp` serve o ranking e a comparação.
  - **Filtros:**
    - Transportadora, UF, tipo de material, tipo de pedido e situação viraram listas de caixas de marcar (`MULTI`, `desenharMulti`). Lista vazia = todos. A situação ganhou "Vencem em até 2 dias" separado de "No prazo".
    - **Filtrar por data:** emissão, data de entrega (final, com reentrega) ou previsão de entrega, de/até, sobre o que já foi consultado.
    - O período da consulta ao Protheus ficou numa linha própria ("Consultar no Protheus: emissão dos pedidos com NF"). Há o botão "Limpar filtros".
    - Marcar uma caixa não redesenha a lista (o foco do teclado não se perde; achado no teste).
  - **CSS:** a auditoria automática (botões com a cor padrão do navegador) deu zero no Edge. Ajustes: hover em `.btn`/`.btn.pri`/`.btn-txt`, "Hoje" com contorno, "Não/Sim" da reentrega sem o estilo de título, nome mais largo no gráfico de comparação. Se o usuário ainda vir botão sem cor, pedir qual: dentro do Protheus o navegador pode ser outro.
  - **Teste:** `npm start` + API falsa (dados fictícios) + Edge headless via puppeteer-core (scripts no scratchpad da sessão: `teste-tela/fake-api.js` e `teste.js`). Testados: filtros (2 transportadoras, situação, data, limpar), data de saída → envio, salvar fecha, Fechar, Retornados, comparação, celular (sem rolagem lateral). Nenhum erro de JavaScript.

- **15/11/2026, pedido do usuário** (API `2026-11-15a` + tela):
  - **Frete destacado (`C5_FRETE`) e não destacado (`C5_ZFRETE`) são só consulta** ("campo virtual para o usuário"). Saíram do `MapaCampos` (o PUT ignora essas chaves) e, na gaveta, viraram campos `readonly` sem `data-f` (classe `so-leitura`, borda tracejada). O GET continua mandando os dois, e os indicadores de frete cobrado não mudaram.
  - **Campos novos na SC5, editáveis só antes da NF** (grupo `COM`): `C5_ESPECI1` (espécie, `especie`, texto, a tela grava em maiúsculas, tamanho em `tamanhos`), `C5_PESOL` (`pesoLiquido`) e `C5_PBRUTO` (`pesoBruto`), numéricos, com até 4 casas na tela (`pesoTxt`). Lidos por `ColOpc` (campo inexistente vira vazio e vai em `camposFaltando`). Com API anterior a `2026-11-15a`, a tela desliga os três.
  - Têm que estar preenchidos **antes da emissão da NF-e**: a gaveta mostra o aviso "Antes da emissão da NF-e, preencha: …" (pedido sem NF) e "peso bruto menor que o líquido". São avisos, não bloqueiam salvar. Cartão novo nos Quadros: **Sem dados para a NF-e** (pedidos sem NF com espécie, peso líquido ou bruto vazio, `faltaNfe`). Decisão minha: o volume não entra nessa cobrança.
  - **Gaveta reorganizada:** Dados do pedido primeiro (transportadora, volume, espécie, pesos e os dois fretes só consulta), depois Envio e entrega, CTE, Reentrega e Retorno.
  - Lista completa ganhou as colunas Espécie, Peso líquido e Peso bruto. A importação por planilha não grava esses campos (só têm regra de título para "segurar" a coluna).
  - Testado com API falsa (dados fictícios) e Chrome headless (puppeteer-core): ordem dos grupos, fretes sem edição, PUT só com volume/espécie/pesos, pedido com NF com tudo desligado, celular sem rolagem lateral, sem erro de JavaScript. Pacotes de homologação e produção gerados em 15/11. **Não testado no Protheus.**

- **15/11/2026 (2ª), pedido do usuário** (API `2026-11-15b` + tela):
  - **Saída programada × envio separados** (escolha do usuário entre 3 opções): o `C5_FECENT` ("Saída programada") **não copia mais** para o `C5_ZDTENV`, nem na API (bloco do `04-regras` removido) nem na tela (`sincronizarSaida` removido). O envio só é gravado quando o pedido sai. Na gaveta, aviso "a saída programada passou e o pedido não saiu". Pedidos gravados entre a `13f` e a `15a` continuam com envio = saída (aparecem como "saiu").
  - **Aba Programação** (`telaProgramacao`, `cartaoKb`), entre Quadros e Lista: kanban de saídas sobre os filtros do topo.
    - Colunas: **Não saíram** (saída programada < hoje e sem envio, com "há N d") → **Hoje** (programados para hoje + os que saíram hoje programados para outro dia) e os próximos dias úteis até 5 colunas (fim de semana só aparece se tiver pedido) → **Depois** → **Sem programação** (sem saída e sem envio, quadro previsto/faturado; com NF primeiro; 60 por vez).
    - **Arrastar** o cartão para um dia grava `previsaoSaida` (mesmo PUT, `gravarRapido`); para "Sem programação" limpa a data. "Não saíram" e "Depois" não recebem. Cartão que já saiu não arrasta.
    - Botão **Saiu** (cartões de hoje, de dias passados e de "Não saíram") grava `dataEnvio` = hoje e mantém a data programada (mostra "programado X, saiu atrasado"). **Desfazer** só no mesmo dia e sem entrega/retorno.
    - Cartão mostra NF ou "Sem NF", "Falta dado da NF-e" (`faltaNfe`), volume, peso bruto e a observação da entrega. Clique abre a gaveta.
    - Card separado **Entregas previstas para hoje** (pedido do usuário): enviados/entregues com `C5_ZDTPREV` = hoje. Botão **Entregue** grava a data de entrega de hoje (`dataNovaEntrega` quando reentrega = Sim).
    - Resumo: saem hoje (saíram / falta sair), não saíram, entregas previstas hoje, com NF sem programação.
    - Com API anterior à `15b` a aba fica só para consulta, com aviso, para não gravar envio sem querer pela cópia antiga.
    - No toque (celular) o arrastar do HTML5 não funciona: reprogramar pela gaveta.
  - **`C5_ZOBS` = observações da entrega** (texto livre, `obsEntrega`): textarea no fim de "Envio e entrega", na busca, na Lista e no cartão da programação. Opcional (`ObsSql`): o tipo da coluna sai do `ALL_TAB_COLUMNS`; BLOB/CLOB (memo real) é lido com `DBMS_LOB.SUBSTR` (até 2000 bytes), senão direto. Memo não tem limite de tamanho no PUT nem `maxlength` na tela e grava quebra de linha como CRLF; campo caracter vira uma linha (quebra = espaço). **Não conferido** se o C5_ZOBS é caracter ou memo no ambiente.
  - Testado com API falsa e Chrome headless: colunas, arrastar para um dia e de volta, Saiu, Entregue, Desfazer, a saída na gaveta sem mexer no envio, observação com 2 linhas, celular sem rolagem lateral da página, sem erro de JavaScript. Pacotes regerados em 15/11. **Não testado no Protheus.**

- **15/11/2026 (3ª), pedido do usuário: DANFE e carta de correção pela tela** (só `LOGRELAPP.PRW` + tela; a API não muda):
  - Caminho: a tela chama `ProJsToAdvplService.jsToAdvpl("danfe"|"cce", '{"nota","serie","pedido"}')` (`Api.nota` no `app.ts`, só dentro do Protheus) e a `Static Function JsToAdvpl` do `LOGRELAPP.PRW` posiciona a SF2 (índice 1, nota+série) e chama a rotina **padrão** da SPEDNFE na thread do SmartClient: as telas padrão abrem por cima do app. O usuário acredita que o DANFE é o padrão do Protheus.
  - DANFE: `SpedDanfe()`, com as perguntas `NFSIGW` preenchidas antes (`SetMVValue`, achando da/até nota, série e tipo de operação = 2 pelo texto do `X1_PERGUNT`). Se o preenchimento falhar, a pergunta abre com os últimos valores.
  - Carta de correção: a primeira que existir de `SPEDCCE`, `SPEDNFECCE`, `SPEDCCEREMESSA`, `SPEDCCEREM`, `SPEDNFECARTA`, chamada por macro com `("SF2", recno, 4)`. **Nome não confirmado:** se nenhuma existir, a mensagem lista as funções `*CCE*` do RPO (`GetFuncArray`) para acertar o nome.
  - Antes, se `F2_CHVNFE` está vazia, pergunta se quer seguir (nota provavelmente não transmitida). Erro na rotina padrão vira `MsgStop` com a descrição e o começo da pilha (sem console no TOTVS Cloud). `Private` `cCadastro`, `aRotina`, `bFiltraBrw` e `aFilBrw` declarados porque rotinas de browse costumam esperar.
  - Tela: barra no topo da gaveta com cada NF do pedido (número, série, data) e os botões **Imprimir DANFE** e **Carta de correção**, com aviso quando passou de 30 dias do faturamento. Botão **DANFE** no cartão da Programação. Fora do Protheus (npm start), botões desligados ou com aviso.
  - Testado só fora do Protheus (botões, aviso, sem erro de JavaScript). **A testar pelo usuário no Protheus**: compilar `LOGRELAPP.PRW` e `logrel.app`.

- **16/11/2026, retorno do teste no Protheus + pedido do usuário** (API `2026-11-16a`, `LOGRELAPP.PRW` e tela):
  - Teste do usuário: **DANFE OK**; a carta de correção **abre e grava**, mas para imprimir era preciso entrar na SPEDNFE.
  - **Impressão da CC-e:** ao fechar a tela da carta de correção, `MsgYesNo` pergunta se quer imprimir (avisa que a CC-e precisa estar vinculada na SEFAZ para sair com protocolo). Botão novo **Imprimir CC-e** na barra da NF (`jsToAdvpl("cceimp")`) para imprimir depois, sem abrir a digitação. `ImprCCe` acha a rotina no **menu da SPEDNFE** (`FWLoadMenuDef("SPEDNFE")`, `AcaoMenu` recursivo: título + pai com CC-e/carta/correção **e** imprimir) e chama como o browse (`("SF2", recno, opção)`, ou a ação como está se já tiver parênteses). Sem menu: tenta `SPEDCCEIMP`, `SPEDIMPCCE`, `SPEDCCEPRT`, `SPEDPRTCCE`, `SPEDCCEPRINT`, `SPEDNFECCEIMP`, `IMPCCE`, `PRTCCE`. Sem nada: `MsgStop` com os títulos do menu e as funções `*CCE*` do RPO. **Nome da rotina de impressão não confirmado.**
  - **Números de série** (igual ao RX Pedidos): cada item ganha `numerosSerie` = `[[serie, nf], ...]` da **Z01** (`Z01_PEDIDO`, `Z01_ITEM`, `Z01_SERIE`, `Z01_NFEDO`), com e sem NF, `(Z01_FILIAL = ' ' OR = xFilial SC6)`, `Z01_SERIE <> ' '`, lotes de 900 pedidos (`NumerosSerie`/`SerieLote`, etapa `02c-series`, vale para GET, PUT e `/busca`). `TemZ01` confere tabela e colunas no `ALL_TAB_COLUMNS` antes; sem elas, itens sem séries e `Z01` em `camposFaltando`. O `serie` do item continua sendo a **série da NF**.
  - Tela: as séries ficam **na linha do produto**, na tabela Itens da gaveta (`seriesItem`, pedido do usuário no mesmo dia): "Nº de série · N de Q un" e uma etiqueta por série; a NF da série só aparece quando difere da NF do item ("sem NF" quando o item tem NF e a série não). Sem série, nada. A busca do topo acha pela série. (A 1ª versão, um bloco no topo da gaveta, `seriesHtml`, foi trocada.)
  - Testado com API falsa (dados fictícios) e Chrome headless: séries na linha do produto (1 série, sem série, 14 séries), busca pela série, celular sem rolagem lateral, sem erro de JavaScript. Pacotes regerados em 16/11 09:50. **Não testado no Protheus.**
  - **2º teste:** a impressão da CC-e **não foi achada**: o `FWLoadMenuDef("SPEDNFE")` não tem nenhuma opção de CC-e (Pesquisar, Wiz.Config., Parâmetros, Status Sefaz, Transmissão, Contribuinte, Danfe > Imp. Padrão/Imp. Etiqueta, Monitor, Visualiza Doc., Filtro, Exportar, Legenda, Inutilização) e o `*CCE*` pegava ACCESS. Diagnóstico refeito (`FuncoesCce`: SPED* de evento/impressão, CCE sem ACCESS, CARTA, CORREC; e `RotinaCce`, a rotina que abre a CC-e). Perguntado ao usuário o caminho que ele usa na SPEDNFE para imprimir a CC-e. Avisos W0003 (`oErr` sem uso) removidos. **3º teste:** com esse diagnóstico, o botão deixou a tela do Protheus **azul por 5 minutos** sem abrir nada. Causas prováveis: `GetFuncArray("SPED*")` varrendo o RPO inteiro, ou um nome adivinhado novo (`SPEDCCEIMPR`, `IMPRCCE`, `CCEIMP`) que existia e foi chamado às cegas. Corrigido: só máscaras `*CCE*` e `*CARTA*`, e nome fora do menu só é chamado com `MsgYesNo` mostrando o nome. **Não chamar rotina por nome adivinhado sem confirmação.**
  - **Final: carta de correção RETIRADA da tela** (pedido do usuário depois da tela azul): a tela e o `LOGRELAPP.PRW` ficaram **só com o DANFE** (`AcaoNf = 'danfe'`; `JsToAdvpl` só trata "danfe"; `CartaCorrecao`, `ImprCCe`, `AcaoMenu`, `RotinaCce`, `FuncoesCce` e `ArrToTxt` apagados). A CC-e continua sendo feita e impressa pela SPEDNFE. A digitação abria por um dos nomes `SPEDCCE`…, mas a impressão não está no `MenuDef` da SPEDNFE deste ambiente: não voltar a isso sem o caminho exato que o usuário usa.

- **18/11/2026, erro 500 na produção** (API `2026-11-18a`, só o `RESTLOGREL.tlpp`):
  - Diagnóstico do usuário: GET `/logistica/pedidos` com "Erro 500 Internal Server Error", sem mensagem, e a versão da API "ainda não carregou".
  - Causa provável: homologação e produção estão no **mesmo Oracle**. As 3 consultas ao `ALL_TAB_COLUMNS` (`ColunasExistentes`, `ObsSql`, `TemZ01`) não filtravam o `OWNER`. Na produção, as colunas `C5_Z*` (e a `Z01`) da homologação pareciam existir, a query usava coluna inexistente e a thread caía sem passar pelo Recover (500 sem `X-Erro`). Corrigido com `OWNER = SYS_CONTEXT('USERENV','CURRENT_SCHEMA')` (`LG_OWNER`), o mesmo filtro do `RESTPANORAMAESTOQUE`. **Toda consulta nova ao dicionário do Oracle leva esse filtro.**
  - O `BuildErro` passou a mandar `Access-Control-Expose-Headers: X-Erro, X-Erro-Etapa`. A tela roda na porta do app e o REST em outra (CORS), então antes o navegador escondia o `X-Erro` e a tela só mostrava "Erro 500".
  - Se os campos ainda não foram criados na produção (`U_LOGRELUPD`), a tela abre com eles em "Campos que faltam na SC5" e sem edição.
  - Na mesma versão saiu o `U_VSAPIACE` das três rotas, a pedido do usuário (ver Rotas). A API não depende mais do `VSACESSO.tlpp`.
  - **Não testado no Protheus.**

- **18/11/2026, planilha `Planilhas/LOGÍSTICA181126.xlsx`** (aba "Página57", 3.732 linhas, as 11 colunas do modelo de importação; fora do Git):
  - Separada com as regras do `importar.ts`/`montarPrevia`/`conferir` (sem a emissão, que precisa do Protheus):
    - `LOGISTICA181126-importar.xlsx`: 3.547 linhas, com pedido e CTE como texto e datas dd/mm/aaaa. Em relação à `LOGISTICA2-importar.xlsx` de 13/11: 66 pedidos novos, 242 com mudança e 3.239 iguais (a tela pula os iguais).
    - `LOGISTICA181126-analise.xlsx`: 182 linhas (168 de pedidos repetidos com dados diferentes, 9 entregas antes do envio, 1 data "17/04/26/26", 1 previsão antes do envio e os CTEs "G", `6584120"` e "OY794027905BR"). Uma segunda aba traz os avisos das linhas que vão na importação.
  - Os **repetidos (78 pedidos)** são entregas parciais: o mesmo pedido sai em 2 ou 3 envios, com material, CTE e datas diferentes. A SC5 só guarda um envio e um CTE por pedido. **Regra a decidir com o usuário.** Outros 3 pedidos repetidos tinham linhas idênticas e vão uma vez só.
  - **Importação na produção (18/11):** a tela deu "Pedido não encontrado no Protheus" para 163 pedidos. A `/busca` chamada direto com Basic Auth (usuário de API do `C:\totvs\credenciais.txt`) achou 161, em 2 s para 400 pedidos. Só 001185 e 003265 não existem para a API. São pedidos com NF, cuja TES não movimenta estoque e que ainda não tinham envio, por isso fora do GET. A busca da tela falhou na hora, e a causa não foi apurada: se voltar, pedir o aviso do topo da importação.
  - **Os 161 foram gravados pela API**, com o mesmo PUT e as regras do `montarPrevia`/`alteracoes`/`conferir` (célula vazia não altera; 6 com reentrega, nova data = data de entrega), a pedido do usuário. Depois a simulação de novo deu os 161 iguais. O relatório está em `Planilhas/LOGISTICA181126-gravados-api.xlsx`. Na produção, os combos vêm do SX3 sem acento (`Periferico`, `Divergencia endereco`…).
  - A importação da tela recusou 000034 (envio 26/01 < emissão 27/01) e 002129 (envio 18/05 < emissão 22/05): é erro na planilha.
  - 22 linhas trazem indicador sem par na lista reserva da tela: Material retido (13), Cliente trocou endereço (3), Loja em obra (3), Divergência de cubagem (1), Problema no CNPJ do cliente (1) e Recusa (1). Esses só gravam se existirem no X3_CBOX do `C5_ZINDICA`; senão, a prévia avisa e o resto da linha grava.

- **19/11/2026, pedido do usuário: custos de frete (ZLC) e histórico (ZLH)** (API `2026-11-19a`, `LOGRELUPD.prw` com a opção Tabelas, tela).
  - **Por quê:** a transportadora às vezes manda o CTE com valor diferente do combinado e o usuário precisa registrar o contato até o ajuste. O pedido pode ter mais de uma reentrega e outras taxas (armazenagem). O usuário escolheu **tabela própria** em vez de campos novos na SC5 ("a quantidade de campos na aba expedição pode confundir") e quis o histórico completo na **mesma API** (sem API nova). Não existe cotação com o valor real: só `C5_FRETE`/`C5_ZFRETE` (cobrado do cliente), então a divergência é marcada à mão.
  - **Decisões do usuário:** tipos E/R/A/D/O e situações D/C/A/I como propostos ("se faltar algo depois, eu ajusto"); exclusão por qualquer usuário porque fica no histórico; importação continua (pode precisar na homologação); a planilha não será mais importada na produção.
  - **ZLC** (custos): `ZLC_FILIAL+ZLC_PEDIDO+ZLC_ITEM` (índice 1) e `+ZLC_SITUA` (índice 2). `ZLC_ITEM` = `MAX` + 1 contando os excluídos (`ProxItem`). `ZLC_OBS` é **C 250** (não memo, para não depender de memo real no TOTVS Cloud). `ZLC_CTE` = tamanho do `C5_ZCTE` com mínimo 20. Exclusão lógica com carimbo de quem excluiu.
  - **ZLH** (histórico): uma linha por campo alterado (`HistTxt` em texto; combo vira "D - Divergente", data dd/mm/aaaa, valor 1.234,56). Ação I/A/E; origem 1 tela, 2 importação (`"origem":"importacao"` no PUT, a tela manda na importação), 3 carga inicial. Grava a SC5 do PUT e a ZLC do POST de custos. Erro no histórico não desfaz a gravação: vai em `avisoHistorico` e a tela mostra.
  - **API:** `TemTab` confere SX2 + colunas no `ALL_TAB_COLUMNS` com `LG_OWNER`. GET manda `custos` por pedido (lotes de 900), `temCustos`, `temHistorico`, `opcoes.tipoCusto`/`situacaoCusto` (X3_CBOX). Com a ZLC, as chaves `cte`/`valorCte`/`cteReentrega`/`valorCteReentrega` do PUT (importação) gravam na 1ª cobrança E/R da ZLC (`CustoDoPedido`), não na SC5. Rotas só nos formatos que já funcionam no TOTVS Cloud (GET com query, POST simples, sem DELETE nem dois parâmetros de caminho). Usuário por `RetCodUsr()`/`UsrRetName()`, como o RESTPCPREL.
  - **Compatibilizador:** `U_LOGRELUPD` → **Tabelas** (`CriaTab`, mesmo caminho do `VSHISTUPD` do RX Pedidos, que já rodou na homologação: SX2/SIX copiados da SC2, campos copiados de C2_FILIAL/C2_OBS/C6_QTDLIB/C2_DATRF). Tabela nova pede sair e entrar e rodar de novo; aí oferece a **carga inicial** (`Carga`/`GravaCarga`): CTE e CTE da reentrega da SC5 → cobranças E e R, com linha de histórico origem 3, pulando pedido que já tem ZLC (mesmo excluída); no fim a **conferência** soma SC5 × ZLC.
  - **Tela:** a gaveta perdeu o grupo "CTE da transportadora" e os campos de CTE da reentrega; ganhou os blocos **Custos de frete** (lista, total, formulário que grava sem fechar a gaveta, sugere Envio → Reentrega → Outra taxa) e **Histórico de alterações** (lido ao abrir). Quadros: KPI e marca no cartão "custo em divergência" e opção no filtro Situação. Lista: CTEs, Custo de frete, Cobranças, Custo em divergência. Indicadores: custo = todas as cobranças, KPI de divergência, comparação "% custo em divergência". Aviso "Falta lançar o CTE do envio em Custos de frete". Sem a ZLC (`temCustos` falso), tudo como antes.
  - Testado com API falsa (dados fictícios) e Chrome headless: incluir, editar, editar sem mudança, validação, excluir, histórico (pedido, cobranças, carga inicial), PUT do pedido no histórico, aviso de CTE, filtro, Lista, Indicadores, celular sem rolagem lateral, sem erro de JavaScript. Pacotes de homologação e produção gerados em 19/11. **Não testado no Protheus; fontes não compilados.**

- **19/11/2026 (2ª), depois de compilar e criar as tabelas na homologação (pedido do usuário):**
  - **Custos visíveis:** "no detalhamento do pedido, as informações de CTE ficam escondidas". O bloco **Custos de frete** virou um grupo do formulário (`fieldset.grupo-custos`), sempre aberto, **logo abaixo de "Envio e entrega"** (antes era um `<details>` fechado depois do formulário). Os campos da cobrança não têm `data-f` e os botões são `type="button"`: não entram no PUT do pedido. O formulário da cobrança virou `div.cform` com `cform-grade` (não é mais fieldset dentro de fieldset). O Histórico continua no fim, fechado.
  - **Exportar XLSX** (botão no topo, `abrirXlsx`/`desenharXlsx`/`gerarXlsxArquivo`): janela com o recorte (todos, previstos, faturados, enviados, entregues, atrasados = `prazo === 'atrasado'` em trânsito ou entregue, retornados, custo em divergência), cada um com a contagem; "Aplicar os filtros da tela" (padrão ligado); abas Pedidos (45 colunas, com custos ou CTE da SC5 conforme `temCustos`), Itens e Custos de frete. A escolha fica no navegador (`logrel-xlsx`). Arquivo `logistica-<recorte>-<AAAA-MM-DD>.xlsx`. `xlsx.ts` copiado do `RX-Pedidos/TELA-RX` (tabela do Excel, Tahoma 10, zip sem compressão; confirmado no Protheus em 17/11 no RX). O CSV da Lista continua.
  - Testado com API falsa e Chrome headless (28 verificações: custos logo abaixo de Envio e entrega e visíveis sem clique, recortes com contagem, download real do .xlsx com 3 abas conferido pelo zip, celular sem rolagem lateral, sem erro de JavaScript). Pacotes regerados em 19/11. Só a tela mudou (API e LOGRELUPD iguais à 1ª de 19/11).

- **19/11/2026 (3ª): planilha `Planilhas/LOGÍSTICA.xlsx` de 19/11 x homologação** (só leitura, relatório `Planilhas/LOGISTICA-conferencia-homologacao-2026-11-19.xlsx`, fora do Git):
  - 3.732 linhas, 3.639 pedidos, 81 repetidos. Nos dois: 2.672 (2.545 iguais, 59 repetidos, 26 com valor diferente, 42 com envio só na planilha: 30 com "envio antes da emissão", quase todos 003406–003445, que na homologação são **outros pedidos** criados lá depois da cópia; 6 entrega antes do envio; 1 previsão antes do envio; 5 sem regra que barrasse: 000703, 001050, 001593, 002122, 002159).
  - **A homologação é uma cópia antiga:** 948 pedidos da planilha (de ~003271 em diante, agosto a novembro) não existem lá. A comparação com a **produção** (só leitura) foi bloqueada pela permissão automática do Claude Code: falta rodar.
  - 19 existem e não aparecem: 13 remessa por conta e ordem (TES 612, fora por regra), 2 TES 610 sem envio (000039, 000432), 1 TES 611 e 1 TES 502 sem envio, 2 sem NF.
  - 93 no Protheus com NF e fora da planilha (até agosto): 89 faturados sem envio (TES 502: 31, 694: 22, 611: 15, 607: 8, 531: 5…), 2 enviados (000287, 003431), 2 entregues (000017, 000144).
  - **Pedido do usuário:** "a TES 610 foi utilizada no início da operação… considere ela" → API `2026-11-19b`: `LG_TES_INCLUI` (`'610'`) entra no filtro dos pedidos com NF como se movimentasse estoque (`OR SC6.C6_TES IN (...)`, sem exigir `C5_TIPO = 'N'`).

- **19/11/2026 (4ª), pedido do usuário: telefone do cliente** (API `2026-11-19c` + tela): `telefone` (cliente de **entrega**, `C5_CLIENT/C5_LOJAENT`) e `telefoneCliente` (cliente do pedido), `A1_DDD` + `A1_TEL` (`A2_*` na devolução/beneficiamento), montados por `Fone` como "(DDD) número". Tela: só em **Cliente e pedido** da gaveta (o usuário pediu para **não** pôr no topo), com link `tel:`; os dois quando são cadastros diferentes; "não cadastrado" sem telefone. Também na busca, na coluna "Telefone (entrega)" da Lista e no XLSX (aba Pedidos, os dois). Testado com API falsa e Chrome headless.

- **19/11/2026 (5ª), produção validada pela API (só leitura, a pedido do usuário):** `2026-11-19c`, `temCustos`/`temHistorico` verdadeiros, GET em 6 s com 4.076 pedidos. Carga inicial às 10:27 (3.344 pedidos com CTE na SC5, nenhuma diferença SC5 × ZLC) e importação da planilha pela tela às 10:36 (75 pedidos sem CTE na SC5 ganharam a cobrança direto na ZLC, origem 2). ZLC: 3.509 cobranças (3.419 Envio + 90 Reentrega), R$ 1.487.237,23. 1 cobrança sem data (001426, reentrega sem nova data). Histórico com o usuário certo (`romulo.garcia`) também nas linhas gravadas pela API. Detalhe cosmético: a cobrança criada pelo PUT tem o resumo "E - Envio - CTE…" (`ResumoCusto` usa o código do combo) e a da carga, "Envio - CTE…".
  - **Planilha de 19/11 × produção** (`Planilhas/LOGISTICA-conferencia-producao-2026-11-19.xlsx`): 3.621 dos 3.639 pedidos na tela, 3.533 iguais; 77 repetidos (entregas parciais, um envio só no pedido); 10 não importados por erro na planilha (000034 e 002129 envio antes da emissão; 001050 data "17/04/26/26"; 000230, 000569, 000681, 002128, 002812, 003568, 003569 entrega antes do envio); 1 diferente (000019). Fora da tela: 13 remessa por conta e ordem (TES 612, por regra), 2 inexistentes (001185, 003265) e 3 com envio que não entram (000710 TES 611, 001064 TES 502, 003973 TES 693: provável resíduo, não conferido). No Protheus com NF e fora da planilha: 206 faturados sem envio (63 de novembro).

- **22/11/2026, pedido do usuário: planilha Google igual à do RX Pedidos**, conectada ao Protheus e atualizada a cada 15 min. Arquivo `planilha/Codigo.gs`.
  - **Mesmo molde do `RX-Pedidos/PCPREL/planilha/Codigo.gs`:**
    - propriedades `PROTHEUS_URL`/`PROTHEUS_USUARIO`/`PROTHEUS_SENHA`/`DIAS`;
    - gatilho de 15 min;
    - `LockService`;
    - aba Atualizacao com 200 execuções;
    - erro pelo `X-Erro`/`X-Erro-Etapa`.
  - **Usa o `GET /logistica/pedidos` sem mudança de API** (acesso só por Basic Auth desde a `2026-11-18a`). `de` = hoje − `DIAS` (padrão 365, igual à tela).
  - **Regras copiadas da tela:** `montar_` = `montar()` do `painel.ts`, com retorno antes de tudo, entrega final, prazo pela previsão, "vence" ≤ 2 dias, cobrado = `C5_FRETE` + `C5_ZFRETE` e custo pela ZLC ou CTE da SC5.
  - **Abas:** Pedidos, Itens e Custos de frete têm as mesmas colunas do Exportar XLSX. Resumo traz pontos de atenção, quadros, transportadoras e entregues por mês. Cor só nas células Quadro e Situação da entrega, como no RX.
  - **Testado** no Node com uma imitação do Apps Script e a API falsa do comunicado (`Comunicados/.../_gerador/mock2.cjs`, 97 pedidos fictícios), com e sem ZLC: sem erro, abas e cores conferidas. **Não testado no Google**; a planilha ainda não foi criada.

- **23/11/2026, pedido do usuário: melhorias na tela** (API `2026-11-23a` + `logrel.app` + `LOGRELUPD` + planilha).
  - **Informação faltando nos Quadros:** o usuário escolheu, entre 2 opções, o **filtro em cada quadro**, em vez de uma coluna separada.
    - `pendencias()` em `painel.ts` calcula as pendências por etapa e as guarda em `Reg.pend`. `PEND_TXT` tem os textos do filtro e do selo.
    - Cada coluna tem o select `data-filtro-quadro` (`e.fQuadro`, não guardado no navegador). O cartão ganha o selo `.pill.falta`, e o "aguardando reenvio" fica com o selo próprio.
    - Com filtro ligado, os Entregues antigos aparecem.
    - Na Lista, no XLSX e na planilha Google: coluna "Informação faltando".
  - **Cards que filtram (`button.kpi`, `e.fGlobal`):** "Com informação faltando" e **"Saíram hoje"** (`dataEnvio` = hoje, pedido do usuário). Clicar liga; clicar de novo, ou na faixa `.filtro-ativo`, desliga.
  - **Observação do retorno, na ZLH e não na SC5** (API `2026-11-23b`). A 1ª versão (`2026-11-23a`, commit `996348d`) usava um campo novo `C5_ZOBSRET`. O usuário não quis "poluir" a SC5, e ninguém tinha criado esse campo. Ele então criou o **`ZLH_OBS`** na ZLH pelo Configurador, sem compatibilizador; tipo e tamanho não foram conferidos daqui. O `LOGRELUPD` voltou a ter 17 campos.
    - **Gravação:** a chave `obsRetorno` do PUT fica fora do `MapaCampos`. Se for diferente da atual (`ObsRetAtual`), `GravaObsRet` grava uma linha `ZLH_CAMPO = OBSRET` com:
      - ação I/A/E (E = texto vazio);
      - texto inteiro no `ZLH_OBS`;
      - `UmaLinha` em VALANT/VALNOV, para o Histórico mostrar.
    - Só com data do retorno (`lRetCampos`, mensagem `SEM_RETORNO`). Sem ZLH/`ZLH_OBS` (`TemObsRet` = `TemTab("ZLH")` + `ColunasDe("ZLH")`), a gravação devolve `CAMPO_INEXISTENTE` com "ZLH_OBS". Um erro na linha vira `avisoHistorico`.
    - **Leitura:** `ObsRetornos`, no fim do `ConsultaPedidos`, lê todas as linhas OBSRET da filial (são poucas) e fica com a última de cada pedido. Memo real é lido por BLOB/CLOB (`ObsZlhSql`). `tamanhos.ZLH_OBS` só vai se o campo for caracter.
    - **Tela:** `CAMPO.obsRetorno = 'ZLH_OBS'` (chave de `faltando`), textarea no bloco Retorno, `RETORNO`/`OBS`, limpa junto com a data do retorno. Com API anterior a `2026-11-23b`, o campo fica desligado.
  - **Endereço e C5_MENNOTA na gaveta:** C5_MENNOTA só para leitura (escolha do usuário).
    - O endereço vem do mesmo cadastro da cidade/UF: `EndCol` usa SAE/SFE, com `A1_END`/`A1_COMPLEM`/`A1_BAIRRO`/`A1_CEP` ou os `A2_*`.
    - Coluna inexistente vira `' '`, conferida em `ColunasDe("SA1"/"SA2")`.
    - `A1_ENDENT` (endereço de entrega do cadastro) não é usado.
    - `ObsSql` ficou genérico (C5_ZOBS e C5_MENNOTA), lendo memo real por BLOB/CLOB.
  - **Período saiu do topo:** `consultar()` usa `e.de` (01/01 do ano anterior) até hoje.
  - **Testado** com a cópia da API falsa (campos novos, pedidos sem transportadora e peso, 2 envios hoje), `ng serve` e Chrome headless: 17 verificações ok, sem erro de JavaScript, celular sem rolagem lateral. A planilha foi testada pelo harness do Node: 18 pendências e 2 "saíram hoje", iguais à tela. Na `2026-11-23b`, a API falsa ganhou um PUT. A gravação mandou só `{"obsRetorno": ...}`, e o texto voltou na gaveta: 18 verificações ok. Pacotes regerados em 23/11 com a `23b`. **Não testado no Protheus.**
- **23/11/2026 (2ª), pedido do usuário** (só a tela; a API continua a `2026-11-23b`):
  - **Coluna "Enviados hoje" nos Quadros:** o "card" que o usuário pediu era uma **coluna**, não o cartão de contagem. `quadroHoje()` lista os pedidos com `dataEnvio` = hoje, em qualquer etapa, com o selo da etapa (`cartao(r, true)`), e entra depois dos Enviados (`cols.splice(3, …)`). A grade passou a 6 colunas em telas largas.
  - **Todos os cartões de contagem dos Quadros filtram** ("em todos os cartões"): `cardsQuadros()` tem id, título, texto e filtro de cada um, e `e.fGlobal` guarda o id do cartão. A faixa `.filtro-ativo` diz quantos pedidos e qual cartão. Testado: os 9 cartões mostram exatamente o número que exibem.
  - **Programação:** a coluna **Não saíram** ganhou uma caixa de texto (`#kb-filtro-nao`, `fNaoSairam`, mesma busca normalizada do topo). Redesenha a tela e devolve o foco ao campo. O cabeçalho mostra "N de M · filtrado", e o cartão "Não saíram" segue com o total. Os 4 cartões da Programação viraram botões (`data-acao="ir"`): rolam até `kb-hoje`, `kb-nao`, `kb-ent` e `kb-sem` e destacam (`.destaque`).
  - Testado com a API falsa e Chrome headless: 21 verificações ok, sem erro de JavaScript, celular sem rolagem lateral. Pacotes regerados.
- **24/11/2026, pedido do usuário** (só a tela; a API continua `2026-11-23b`):
  - **"Sem CTE" nos custos de frete:** a caixa `#cf-semcte` grava a marca `SEM_CTE = 'SEM CTE'` no `ZLC_CTE`. A API já aceita, porque a regra `SEM_VALOR` só barra valor 0 sem CTE, então não houve mudança na API. Com valor, é frete pago sem CTE; com valor 0, é movimentação interna sem cobrança. A tabela mostra o selo "Sem CTE" e "sem cobrança". `r.ctes` mostra "Sem CTE". O resumo do histórico gerado pela API fica "… - CTE SEM CTE …" (cosmético).
  - **Pendência/aviso de CTE:** antes só uma cobrança tipo E contava, e o usuário lançava "Outra taxa" com texto e continuava com "falta CTE". Agora **qualquer cobrança** resolve, em `pendencias()`, no aviso da gaveta e em `pendencias_()` da planilha. Os textos mudaram para "CTE ou custo de frete". Depois de gravar uma cobrança, `atualizarForm()` refaz os avisos da gaveta.
  - **Atualização automática igual à do RX Pedidos** (`TELA-RX/painel.ts`):
    - botões no topo (`AUTO_OPCOES`), escolha guardada em `logrel-auto-min` (padrão 5);
    - `setInterval` de 15 s, `verificarAuto`, `motivoEspera` (gaveta, modal, importação, XLSX, arrastando, filtro múltiplo aberto, gravação, campo em foco);
    - resposta guardada em `auto.pendente` e aplicada quando liberar; `falhaAuto` mantém os dados;
    - `app.ts` ganhou `carregar(…, silencioso)` e `parar()` no `ngOnDestroy`;
    - preserva a rolagem da página e do `.kb-quadro`. O token já era renovado pelo REST (`token.interceptor.ts`, igual ao RX).
  - **Testado** com a API falsa (com POST de custos e registro das consultas) e Chrome headless: 15 verificações ok.
    - "Sem CTE" grava `cte: "SEM CTE"`, `valor: 0`; a pendência e o aviso somem.
    - Com o relógio da página adiantado, a tela buscou sozinha. Com pedido aberto, mostrou "aguardando: pedido aberto" e não buscou.
    - Sem erro de JavaScript.
- **24/11/2026 (2ª), ajustes visuais pedidos pelo usuário com print:**
  - a caixa "Sem CTE" saía gigante, porque herdava o `.grupo-f .campo input { width: 100% }`; agora tem regra própria (`label.check-sem-cte`, caixa de 16 px);
  - o selo da etapa (`.pill.etapa`, na gaveta e no quadro Enviados hoje) só tinha uma faixa de cor na lateral e parecia sem cor; agora é preenchido com a cor do quadro, com texto escuro (`#16202a`), que tem contraste suficiente nas 5 cores.
- **24/11/2026 (3ª):** o usuário buscou um pedido entregue e ele só aparecia na Lista completa. O quadro Entregues cortava em `DIAS_ENTREGUES` (30 dias) mesmo com a busca preenchida. Agora, com texto na busca, o corte não vale (testado com a API falsa: o pedido entregue em 07/10 aparece com a busca e some sem ela).
- **24/11/2026 (4ª):** a busca "000287" trazia também 8 pedidos cuja NF contém o número (NF 000002871…). Em `base()`, número de até 6 dígitos que é um pedido (`padStart(6, "0")`) filtra **só esse pedido** em toda a tela; outros números e textos seguem a busca normal. Na homologação o 000287 está em **Enviados** (NF 24/09, envio 13/11, sem entrega). Se o usuário não o viu nos quadros, provavelmente era a produção, ainda com a tela de 19/11, ou um entregue há mais de 30 dias, que é o corte corrigido no commit anterior.

- **24/11/2026 (5ª), pedido do usuário: melhorias nos envios** (API `2026-11-24b` + `logrel.app` + planilha):
  - **Situação na produção** (lida pela API, só leitura, antes de mexer): o indicador "6 Extravio" estava em 11 pedidos. Desses, 8 foram entregues depois, 1 foi lançado como retorno "Outros" com reenvio (002731 → 003220) e 2 ficaram em Enviados sem fim: o **000650**, desde fevereiro, e o **003050**, desde julho. Havia só 3 retornados: 002731, 004543 e 001426 (sem motivo e sem reenvio).
  - **Decisões do usuário:**
    - extravio e reembolso **na ZLH**, sem mexer na SC5;
    - em vez de mexer nos Retornados, uma **caixa "finalizado"** que encerra o pedido sem a data de entrega (por exemplo, a mercadoria foi em outro pedido);
    - a descrição do indicador "Outros" **na ZLH**, como a observação do retorno.
  - **API:** `CamposZlh()` lista as chaves que ficam na ZLH, cada uma com um `ZLH_CAMPO` próprio: `OBSRET`, `FINALIZ`, `FINMOT`, `FINDATA`, `FINPED`, `REEMB`, `REEMBVL`, `REEMBDT`, `FINOBS` e `OBSIND`.
    - O **valor cru** vai no `ZLH_OBS` (`ZlhIn`/`ZlhOut`) e o texto legível em `VALANT`/`VALNOV` (`ZlhTxt`).
    - `ValoresZlh` (GET) fica com a última linha de cada pedido + campo. `ZlhAtuais`/`ZlhFinal` dão o valor atual para as regras. `GravaZlh` substitui o `GravaObsRet`, e `ObsRetornos`/`ObsRetAtual` saíram.
    - Combos fixos `FIN_MOTIVOS`/`FIN_REEMB` (`OpcoesBox`) vão em `opcoes.motivoFinal`/`opcoes.reembolso`.
    - As regras ficam na etapa `04-regras` (`FINALIZACAO_INVALIDA`, `SEM_FINALIZADO`) e só rodam quando o corpo traz alguma chave da ZLH. A importação, que só manda campos da SC5, não passa por elas.
  - **Tela:**
    - etapa nova `fin` ("Finalizado"), depois de `ent` e antes de `env`: retorno > entrega > finalizado > envio;
    - nos Quadros fica na coluna do retorno, que passou a se chamar **"Retornados e finalizados"** (`COLUNAS_QUADRO`, `COL_RET`, ordem por `dataFim`). Sai da Programação e não entra no % no prazo;
    - cartão **Reembolsos pendentes** (extravio com reembolso vazio ou P);
    - pendências novas: `reembolso` e `descInd` (indicador "Outros" sem descrição);
    - gaveta: grupo **Finalizar sem entrega**. Marcar a caixa põe a data de hoje. Os campos ligam e desligam pelo motivo e pelo reembolso. Desmarcar limpa tudo (`FINAL`/`REEMBOLSO` no `alteracoes`, só quando o formulário traz a caixa);
    - textarea "O que aconteceu?" só com o indicador "Outros" (`ehOutros`: texto da opção começa com "Outro"). Trocar o indicador limpa a descrição;
    - Lista, XLSX (recorte "Finalizados sem entrega") e planilha Google ganharam as colunas da finalização e a descrição do indicador. O CSV da Lista passou a formatar a data do retorno, que antes saía crua;
    - `INDICA_PADRAO` ganhou `7=Outros`.
  - **Testado** com a API falsa do comunicado, copiada no scratchpad com PUT e 3 finalizados, e Edge headless: 29 verificações ok, sem erro de JavaScript, celular sem rolagem lateral. A planilha foi conferida no Node (`vm`) com a mesma API. Pacotes regerados em 24/11 17:40. **API não compilada nem testada no Protheus.**

- **25/11/2026, pedido do usuário: envios parciais** (API `2026-11-25a` + `LOGRELUPD` + `logrel.app` + planilha).
  - **O pedido:** o usuário fatura o mesmo pedido de venda em partes e precisa lançar frete e CTE de cada novo envio.
  - **Respostas do usuário:**
    - cada envio tem **uma NF própria**;
    - por envio: CTE, valor do frete, data de envio, previsão, data de entrega, tipo de material e indicador de atraso;
    - a observação é a mesma do pedido;
    - **a transportadora pode ser diferente** da do 1º faturamento;
    - a reentrega fica por pedido (proposta aceita).
  - **Desenho aprovado:**
    - o 1º envio (NF mais antiga, `nfPrincipal`) fica nos campos da SC5;
    - os seguintes ficam na **ZLE**, com `ZLE_FILIAL+ZLE_PEDIDO+ZLE_NF+ZLE_SERIE` (índice 1), `ZLE_DTENV`, `ZLE_DTPREV`, `ZLE_DTENTR`, `ZLE_TPMAT` e `ZLE_INDICA` (combos copiados de `C5_ZTPMAT`/`C5_ZINDICA` na criação), `ZLE_TRANSP` (padrão `F2_TRANSP`) e o carimbo;
    - **`ZLC_NF`** na ZLC: vazio = 1º envio.
  - **API:**
    - a consulta lê `F2_TRANSP` e monta as NFs de cada pedido (`aNfsAll`, na mesma ordem do `aPed`);
    - `EnviosPedidos`/`EnvioLote` montam `nfPrincipal` e `envios` (NFs depois da 1ª, ordenadas por emissão e número);
    - `TemTab("ZLE")`; o GET manda `temEnvios` e `temNfCusto`;
    - `CustoLote(…, lNf)` lê o `ZLC_NF` só se a coluna existe. O `GravaCusto` aceita `nf`: `NfDoPedido` confere que a NF é do pedido, e sem a coluna devolve `CAMPO_INEXISTENTE`. `ResumoCusto` mostra a NF;
    - rota nova **`POST /logistica/envios`** (`GravaEnvio`, `MapaEnvio`):
      - inclui ou altera a linha da ZLE, só com os campos do corpo;
      - regras: envio ≥ emissão da NF, entrega exige envio e entrega ≥ envio, combos do `C5_ZTPMAT`/`C5_ZINDICA`, transportadora no SA4;
      - grava o histórico na ZLH (`ZLH_CAMPO` = `ZLE_*`, título "NF x - campo").
  - **Tela:**
    - `envios()` e `envio()` montam `Reg.envs` (`Env`, com idx 0 = SC5). No `montar`, a etapa do pedido sai dos envios: ret > todos entregues > fin > algum em trânsito > fat. O prazo é o do pior envio (`RANK_PRAZO`) e o `entFinal` é a última entrega;
    - `pendencias(…, envs)` troca as pendências de envio pelas de cada NF;
    - `saiuHoje` é usado nos cartões e no quadro Enviados hoje;
    - gaveta: `enviosHtml` (`#lg-envios`, botões `envio-salvar`/`ev-hoje`, `data-envnf` no "+ Cobrança deste envio", porque `data-nf` já é do DANFE), `salvarEnvio` (manda só o que mudou), `cf-nf` no formulário da cobrança e a coluna "Envio" na tabela de custos;
    - `porEnvio()` gera um registro por envio para os Indicadores e a aba Envios do XLSX; a Lista usa o envio da NF do item (`envioDoItem`);
    - planilha: `envios_`/`envio_`, `pendencias_` por envio, `saiuNoDia_` e a aba **Envios** (`gravarEnvios_`).
  - **Testado** com a API falsa (`mock4`, 3 pedidos em 2 NFs, POST de envios e de custos) e Chrome headless: 17 verificações ok.
    - Quadros: Enviados, Entregues e Faturados conforme os envios; selo "1 de 2 envios"; pendência de envio da 2ª NF.
    - O POST de envio manda só o que mudou, e o pedido entra em Enviados hoje.
    - A cobrança vem com a NF escolhida e aparece no bloco do envio.
    - Indicadores e Lista abrem. Sem erro de JavaScript, e o celular sem rolagem lateral.
  - **Não compilado nem testado no Protheus.**

## Pendências
- **25/11/2026, envios parciais:**
  1. Homologação: compilar `LOGRELUPD.prw`.
  2. Rodar o `U_LOGRELUPD`, opção **Tabelas**, fora do expediente. Ele cria a **ZLE** e o **`ZLC_NF`**.
  3. Sair e entrar no Protheus.
  4. Compilar `RESTLOGREL.tlpp` `2026-11-25a`, que inclui a `24b`, e o `logrel.app`.
  5. Conferir num pedido faturado em 2 NFs: o bloco do 2º envio, gravar datas, "+ Cobrança deste envio" e o histórico.
  6. Depois, na produção, a mesma ordem. Colar o `planilha/Codigo.gs` novo, que tem a aba Envios.
- **24/11/2026 (5ª), finalização sem entrega:**
  1. Compilar `RESTLOGREL.tlpp` `2026-11-24b` e o `logrel.app` na homologação e depois na produção. A `24b` inclui o diagnóstico da `24a`.
  2. **Criar a opção `7=Outros` no combo (X3_CBOX) do `C5_ZINDICA`** pelo Configurador, nas duas bases. Sem ela, o "Outros" não aparece: a tela usa o combo do SX3.
  3. Na produção, finalizar o **000650** e o **003050** como extravio, com o reembolso de cada um. O 002731 está lançado como retorno "Outros" com reenvio no 003220; pode ficar assim ou passar para extravio (apagar o retorno e marcar finalizado).
  4. Colar o `planilha/Codigo.gs` novo no Apps Script.
- **24/11/2026, feito (informado pelo usuário):** a produção está compilada (API `2026-11-23b` e `logrel.app` de 24/11) e a planilha Google está ativa. As pendências de 22/11 e 23/11 sobre a compilação na produção e a planilha ficam resolvidas.
- **24/11/2026, projeto da logística reversa começou** (ver `IDEIAS-REVERSA-E-CTE.md`).
  - API `2026-11-24a`: rota só de leitura `GET /logistica/reversa/diagnostico` (`getVsLogRevDiag`, `DiagReversa`, `DiagLinhas`, `Faltam`). Nada mais mudou na API, e a tela não muda. **Compilada pelo usuário na homologação em 24/11** (base com cópia da produção até agosto de 2026) e lida de fora com o usuário de consulta. O resultado está no `IDEIAS-REVERSA-E-CTE.md`. Os números servem de ordem de grandeza.
  - Próximo passo, depois do diagnóstico: o **beta do cadastro da coleta**, que o usuário aprovou para melhorar depois.
- **23/11/2026:**
  1. Homologação: a API `2026-11-23b` e o `logrel.app` foram compilados pelo usuário e conferidos pela API em 23/11 (2.840 pedidos, endereço em 2.838, C5_MENNOTA em 2.770, `ZLH_OBS` C 250, 511 pedidos com informação faltando). O `logrel.app` da 2ª rodada (coluna Enviados hoje, cartões que filtram, filtro do Não saíram) também foi **compilado pelo usuário em 23/11**. Números esperados na tela, calculados pela API às 21:45 com as regras da tela:
     - cartões: informação faltando 510, saíram hoje 3 (000372, 000587, 000591, marcados "Saiu" no teste), em trânsito atrasados 1, faturados parados 96, sem previsão 3, sem dados para a NF-e 176;
     - colunas: Previstos 102, Faturados 96, Enviados 7, Enviados hoje 3, Entregues 2.635;
     - Programação: saem hoje 3, não saíram 167, com NF sem programação 3.

     A conferência visual fica com o usuário. Na homologação não há pedido retornado: a observação do retorno só pode ser testada depois que o usuário lançar um retorno.
  2. Conferir: gravar e alterar uma observação de retorno (aparece no Histórico); endereço e C5_MENNOTA na gaveta.
  3. Produção: criar o `ZLH_OBS` igual ao da homologação e depois compilar os mesmos fontes.
  5. Colar o `planilha/Codigo.gs` novo no Apps Script.
- **22/11/2026, ideia em estudo (nada implementado): logística reversa e CTEs de entrada.** Desenho, respostas do usuário e perguntas em aberto estão em `IDEIAS-REVERSA-E-CTE.md`. O usuário vai estudar como o faturamento lança as NFs e como cruzar isso no Protheus. **Não implementar antes dessas respostas.** Em 24/11 o usuário pediu para começar o projeto. As perguntas de 24/11 estão no documento.
- **22/11/2026:** criar a planilha Google, colar o `planilha/Codigo.gs`, cadastrar as propriedades (REST da produção 10407, usuário de leitura) e ligar a atualização automática. Conferir as contagens do Resumo com a tela.
- **19/11/2026 (4ª):** compilar `RESTLOGREL.tlpp` `2026-11-19c` (inclui a 19b, TES 610) e o `logrel.app` de 19/11 (telefone; inclui custos visíveis e Exportar XLSX).
- **19/11/2026 (3ª):** compilar o `RESTLOGREL.tlpp` `2026-11-19b` (TES 610) na homologação; conferir 000039 e 000432 na tela. Rodar a comparação da planilha com a produção (só leitura) quando houver permissão.
- **19/11/2026 (2ª):** compilar o `logrel.app` novo (custos visíveis + Exportar XLSX) e conferir o download do .xlsx dentro do Protheus.
- **19/11/2026, custos de frete e histórico:** **tabelas criadas e fontes compilados na homologação pelo usuário em 19/11.** **Carga conferida em 19/11 pela API da homologação (só leitura):** GET `2026-11-19a` em 3 s, `temCustos`/`temHistorico` verdadeiros, combos do SX3 certos; 2.838 pedidos no GET, 2.491 com cobrança, 2.571 cobranças (2.491 Envio + 80 Reentrega), R$ 1.118.408,44 na SC5 = R$ 1.118.408,44 na ZLC, nenhum pedido com CTE ou valor diferente entre SC5 e ZLC, nenhum item repetido, histórico origem 3 gravado com o usuário. 102 pedidos enviados sem CTE nenhum (4 de novembro) mostram o aviso "Falta lançar o CTE do envio". Ainda não havia nada lançado pela tela. Ainda conferir: CTE antigo virou cobrança de Envio; incluir/editar/excluir cobrança; histórico com o nome do usuário (não testado se `UsrRetName` funciona na thread do REST com o token da tela; no RESTPCPREL funciona); combo da situação no histórico. Na produção, depois dos campos `C5_Z*`, mesma ordem.
- **18/11/2026:** compilar o `RESTLOGREL.tlpp` `2026-11-18a` na produção (e na homologação) e conferir no Diagnóstico a versão e os campos que faltam.
- **16/11/2026:** compilar `RESTLOGREL.tlpp` `2026-11-16a` (séries), `LOGRELAPP.PRW` (só DANFE) e `logrel.app` (16/11 09:50). Conferir o DANFE de novo e as séries de um pedido com Z01 contra o RX Pedidos.
- **18/11/2026, compatibilizador dos campos `C5_Z*`: `COMPAT/LOGRELUPD.prw` (`U_LOGRELUPD`), não compilado nem testado.** Atende o pedido de 16/11.
  - **Exportar (homologação):**
    - pega todos os registros do SX3 com `X3_ARQUIVO = 'SC5'` e campo começando com `C5_Z`, com todas as colunas do registro;
    - pega também os gatilhos SX7 dos campos com `X3_TRIGGER = 'S'`;
    - cada coluna vai como `{"t": tipo, "v": valor}`, com texto em `Encode64`, para não estragar os campos codificados na troca de codificação;
    - grava `\logrelupd\LOGRELUPD_<emp>_<AAAAMMDD>.json` no servidor e copia para uma pasta local (`cGetFile` + `CpyS2T`);
    - avisa se faltar algum dos 17 campos que a API usa (`Esperados()`).
  - **Importar (produção):**
    - leva o arquivo local para o servidor (`CpyT2S`) e mostra a prévia: criar / já existe igual / já existe com outro tipo, tamanho ou decimal (nunca altera);
    - cria só o que falta, com `X3_ORDEM` = `Soma1` do maior da SC5;
    - se a pasta (`X3_FOLDER`) não existir no SXA, deixa o campo sem pasta; se a F3 não existir no SXB, só avisa;
    - cria os gatilhos que faltam;
    - fecha a SC5 e roda `X31UpdTable("SC5")`; depois confere as colunas por `TCStruct`.
  - **Não testado no TOTVS Cloud:**
    - o `RecLock` no SX3/SX7 (o `VSHISTUPD` usa o mesmo caminho e também não foi testado);
    - o `cGetFile`/`CpyS2T` no SmartClient do usuário.
  - **Se a cópia de arquivo falhar,** o JSON fica em `\logrelupd\` do servidor da homologação. Outra saída é o usuário mandar a lista da tela de exportação, para virar um compatibilizador com os campos fixos no fonte.
  - **Ordem na produção:**
    1. `LOGRELUPD` (fora do expediente);
    2. sair e entrar no Protheus;
    3. `RESTLOGREL` + `LOGRELAPP` + `logrel.app` de produção.
  - `C5_ZFRETE` já existe na produção (o RESTPEDIDOS usa). Deve aparecer como "já existe"; se aparecer com outra definição, conferir à mão.
  - **18/11, exportação feita na homologação** (ambiente `romulo`, arquivo `C:\Protheus\logrelupd_01_20261118.json` na estação, fora do Git):
    - **Conteúdo:** 38 campos `C5_Z*` e 1 gatilho. Os 17 da API vieram todos.
    - **Também vieram campos de outras rotinas:** `C5_ZUF`, `C5_ZNOMCLI`, `C5_ZBOLETO`, `C5_ZRECON` e outros. Por isso a importação passou a criar **só os campos de `Esperados()`** e os gatilhos deles. Os outros, se faltarem na produção, só aparecem na prévia. O único gatilho é o `C5_ZRECON` → `C5_ZRSERIE`, que não é da logística.
    - **Definições confirmadas na homologação:**
      - `C5_ZOBS` é **caracter 70**, não memo;
      - os valores (`C5_ZVLRCTE`, `C5_ZVCTERE`) são N 12,2;
      - as datas são D 8;
      - os campos da logística ficam na **pasta 3** do SXA, e a prévia mostra o nome dessa pasta na produção;
      - `C5_ZTPPEDI` (C 3, F3 `ZV` do SX5) é comercial e deve existir na produção.
    - `C5_ZPEDREN` estava com C 5 (o pedido tem 6 dígitos). O usuário corrigiu para **C 6** na homologação e exportou de novo às 08:46 de 18/11. Conferido: os 17 campos estão no arquivo. Falta importar na produção, fora do expediente.
- **15/11/2026:** compilar o `RESTLOGREL.tlpp` `2026-11-15b` e o `logrel.app` juntos (homologação, depois produção). Conferir que espécie e pesos gravados pela tela aparecem no pedido (MATA410) e saem na NF-e.
- Homologação funcionando desde 13/11/2026 (VSACESSO, RESTLOGREL, LOGRELAPP e logrel.app compilados). 1ª carga da planilha feita pelo usuário em 13/11/2026 (com pedidos recusados como "fora da consulta"). **A compilar juntos:** `RESTLOGREL.tlpp` `2026-11-13f` (inclui a `c`, a exclusão da remessa por conta e ordem (`d`), os retornos (`e`) e o `C5_FECENT` editável (`f`); o usuário cria `C5_ZDTRET`, `C5_ZMOTRET` e `C5_ZPEDREN`) (Previstos = todos sem NF, rota `/busca`, base com pedidos enviados) e o `logrel.app` regerado (reentrega, CTE da reentrega, indicador, busca dos pedidos fora da consulta). Com a API velha, a tela avisa que a busca falhou e esses pedidos ficam como "não encontrado". Conferir o desempenho do GET (o `NOT EXISTS` roda em toda a SC6 da filial).
- Conferir no Diagnóstico se aparece "Campos que faltam na SC5" e se o combo do C5_ZTPMAT chega com D=Pedestal.
- Confirmar com o usuário: base só `C5_TIPO = 'N'`; bloqueio dos dados comerciais depois da NF; regra de atraso com reentrega (conta a nova data); período pela emissão.
- O CSV não foi testado dentro do Protheus (download no navegador embutido), nem o "Escolher arquivo" da importação; colar do Excel não depende disso.
- Ideias não feitas: registrar envio em lote (vários pedidos, mesma data/CTE), atualização automática. (O log de quem alterou virou o histórico ZLH em 19/11/2026.)
