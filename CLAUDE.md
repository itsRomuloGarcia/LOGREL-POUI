# LOGREL — Logística (pedidos de entrega)

Tela PO UI dentro do Protheus para a logística acompanhar e editar os pedidos de entrega. Criada em 13/11/2026 no molde do PCPREL (`PO-UI-Protheus-main`).

| Parte | Arquivo | Vai para o RPO |
|---|---|---|
| API | `API/RESTLOGREL.tlpp` (`getVsLogPedidos`, `putVsLogPedido`, `postVsLogBusca`), versão `LG_VERSAO` = `2026-11-15b` | sim |
| Menu | `LOGRELAPP/LOGRELAPP.PRW` (`U_LOGRELAPP` → `FwCallApp("logrel")`) | sim |
| Tela | `app/` (Angular 21, PO UI 21.36, `@totvs/protheus-lib-core` 21.1.4) → `app/dist/<ambiente>/logrel.app` | sim (recurso) |
| Acesso | `..\API-Acesso-main\VSACESSO.tlpp` (`U_VSAPIACE`) | sim, se ainda não estiver |

Cada pasta de patch (`API/`, `LOGRELAPP/`, `app/dist/homologacao/`, `app/dist/producao/`) tem só o arquivo que vai para o RPO. Não criar outros arquivos nelas.

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
- `POST /api/v1/vs-financial-data/logistica/pedidos/busca` `{"pedidos": [...]}` (até 500): pedidos pelo número, **sem filtro** de período, TES, tipo ou resíduo; responde `{versao, pedidos, naoEncontrados}`. A importação usa para os pedidos da planilha que não vieram no GET (lotes de 400). Criada em 13/11/2026 (`2026-11-13c`), depois que o usuário recebeu "Pedido fora da consulta" e pediu que a importação "aceite todos".
- As duas chamam `U_VSAPIACE(.T., "U_LOGRELAPP")`: passa quem está no `MV_VSAPUSR` ou tem a rotina no menu (vazio = libera).

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

## Pendências
- **15/11/2026 (3ª):** usuário vai compilar `LOGRELAPP.PRW` + `logrel.app` e testar DANFE e carta de correção no Protheus. Se a CC-e não abrir, a mensagem traz as funções `*CCE*` do RPO: acertar o nome na lista do `CartaCorrecao`. Se o DANFE abrir sem a nota preenchida, conferir o texto das perguntas `NFSIGW` no SX1. Depois, ver se a carta de correção fica restrita a alguns usuários.
- **15/11/2026:** compilar o `RESTLOGREL.tlpp` `2026-11-15b` e o `logrel.app` juntos (homologação, depois produção). Conferir que espécie e pesos gravados pela tela aparecem no pedido (MATA410) e saem na NF-e.
- Homologação funcionando desde 13/11/2026 (VSACESSO, RESTLOGREL, LOGRELAPP e logrel.app compilados). 1ª carga da planilha feita pelo usuário em 13/11/2026 (com pedidos recusados como "fora da consulta"). **A compilar juntos:** `RESTLOGREL.tlpp` `2026-11-13f` (inclui a `c`, a exclusão da remessa por conta e ordem (`d`), os retornos (`e`) e o `C5_FECENT` editável (`f`); o usuário cria `C5_ZDTRET`, `C5_ZMOTRET` e `C5_ZPEDREN`) (Previstos = todos sem NF, rota `/busca`, base com pedidos enviados) e o `logrel.app` regerado (reentrega, CTE da reentrega, indicador, busca dos pedidos fora da consulta). Com a API velha, a tela avisa que a busca falhou e esses pedidos ficam como "não encontrado". Conferir o desempenho do GET (o `NOT EXISTS` roda em toda a SC6 da filial).
- Conferir no Diagnóstico se aparece "Campos que faltam na SC5" e se o combo do C5_ZTPMAT chega com D=Pedestal.
- Confirmar com o usuário: base só `C5_TIPO = 'N'`; bloqueio dos dados comerciais depois da NF; regra de atraso com reentrega (conta a nova data); período pela emissão.
- O CSV não foi testado dentro do Protheus (download no navegador embutido), nem o "Escolher arquivo" da importação; colar do Excel não depende disso.
- Ideias não feitas: registrar envio em lote (vários pedidos, mesma data/CTE), log de quem alterou, atualização automática.
