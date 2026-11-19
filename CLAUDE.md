# LOGREL — Logística (pedidos de entrega)

Tela PO UI dentro do Protheus para a logística acompanhar e editar os pedidos de entrega. Criada em 13/11/2026 no molde do PCPREL (`PO-UI-Protheus-main`).

| Parte | Arquivo | Vai para o RPO |
|---|---|---|
| API | `API/RESTLOGREL.tlpp` (`getVsLogPedidos`, `putVsLogPedido`, `postVsLogBusca`, `postVsLogCusto`, `getVsLogHistorico`), versão `LG_VERSAO` = `2026-11-19a` | sim |
| Tabelas | `COMPAT/LOGRELUPD.prw` (`U_LOGRELUPD`): campos `C5_Z*` (Exportar/Importar) e, desde 19/11/2026, as tabelas ZLC/ZLH (opção Tabelas + carga inicial) | sim |
| Menu | `LOGRELAPP/LOGRELAPP.PRW` (`U_LOGRELAPP` → `FwCallApp("logrel")`) | sim |
| Tela | `app/` (Angular 21, PO UI 21.36, `@totvs/protheus-lib-core` 21.1.4) → `app/dist/<ambiente>/logrel.app` | sim (recurso) |
| Acesso | só o menu (`U_LOGRELAPP`). O `U_VSAPIACE` saiu da API em 18/11/2026 (`2026-11-18a`) | não |

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

## Pendências
- **19/11/2026, custos de frete e histórico:** na homologação, compilar `LOGRELUPD.prw`, rodar **Tabelas** (sair/entrar, rodar de novo para a carga e ver a conferência), compilar `RESTLOGREL.tlpp` `2026-11-19a` e o `logrel.app` de 19/11. Conferir: CTE antigo virou cobrança de Envio; incluir/editar/excluir cobrança; histórico com o nome do usuário (não testado se `UsrRetName` funciona na thread do REST com o token da tela; no RESTPCPREL funciona); combo da situação no histórico. Na produção, depois dos campos `C5_Z*`, mesma ordem.
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
