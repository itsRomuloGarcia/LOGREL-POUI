# Ideia em estudo: logística reversa e CTEs de entrada

**Situação (24/11/2026): o projeto começou.** O usuário pediu para começar e perguntou o que mais falta saber. Nada foi implementado ainda. Em 24/11 o usuário também explicou como o retorno de locação é lançado (seção abaixo).

**Solicitação de coleta (usuário, 24/11/2026):** chega por e-mail, então **não há como prever no sistema**, a não ser quando a NF de devolução é lançada antes da coleta. Consequência para o desenho: a reversa só aparece sozinha a partir da NF de entrada (x909). Antes dela, só existe se a logística cadastrar a partir do e-mail.

## Pedido do usuário

Além das saídas que a tela já acompanha, a logística também cuida de:
- **logística reversa** de locações e comodatos, ou seja, o equipamento voltando do cliente;
- **outros pedidos que chegam com CTE**, como as compras feitas pelo departamento de compras.

O usuário quer adaptar isso ao que já existe.

## Respostas do usuário (22/11/2026)

1. **Como a coleta é pedida:** por e-mail. Não fica registro no Protheus.
2. **Quem paga o frete:**
   - Reversa: o frete de retorno é cobrado do cliente no início da negociação. Quando ele assina, paga o frete de saída e o de retorno.
   - Compras: geralmente quem paga é o fornecedor.
3. **CTE:** é lançado no Protheus, mas **não fica amarrado à NF**.
4. **Contrato:** não existe contrato no Protheus para locação ou comodato.
5. **Onde fica a reversa:** numa aba nova, separada, para não misturar com as saídas.

## Respostas do usuário (24/11/2026, 2ª rodada)

1. **Solicitação e cotação:** o cliente pede a coleta por e-mail. Antes é feita uma **cotação**. A NF **sempre** é emitida para a coleta, porque sem ela a transportadora não coleta. O usuário quer o controle no sistema e pensou em **digitar o CNPJ do cliente** e vincular a partir dele.
2. **A NF de entrada própria é emitida antes da coleta.**
3. **Chegada:** o fiscal dá a entrada da NF, e o saldo vai para um armazém. A conferir no diagnóstico: qual movimento é esse (a MATA910 não movimenta estoque; ver se é MATA103, classificação ou transferência) e qual armazém.
4. **A reversa encerra na chegada.** Não há acompanhamento de conserto pela logística.
5. Perguntou como seria o cadastro: proposta na seção "Cadastro da coleta".
6. **O frete de retorno vem somado no frete da remessa** (`C5_FRETE`/`C5_ZFRETE`).
7. **A empresa paga a transportadora** na reversa.
8. **Números de série que voltam:** muitas vezes vêm no e-mail. Quando não vêm, são digitados na chegada.
9. **Escopo inicial: só locação e comodato.**

## Respostas do usuário (24/11/2026, 3ª rodada)

1. **Cotações:** registrar **todas** as cotações. Geralmente quem coleta é a mesma transportadora que levou na remessa, então ela pode vir sugerida (transportadora do pedido da remessa).
2. **Entrada na chegada depende de quem emite a NF:**
   - **o cliente emite:** o fiscal dá a entrada aqui (MATA103) quando a mercadoria chega. Esse é o sinal automático de **recebida**;
   - **a empresa emite (NF de transporte, entrada própria):** **não** há outra entrada na chegada, porque a entrada já foi feita com a NF de transporte, antes da coleta. A **chegada tem que ser confirmada pela logística na tela**.
3. **O cadastro proposto vira um beta**, para melhorar depois.

**Diagnóstico escrito (API `2026-11-24a`):** `GET /logistica/reversa/diagnostico`. Primeiro na homologação, que tem cópia da produção até agosto de 2026.

## Resultado do diagnóstico `2026-11-24a` na homologação (24/11/2026)

Base da homologação = cópia da produção até agosto de 2026; desde 12/2024. Rodou em 3,5 s, sem erro. Os números são ordem de grandeza.

**TES (filial 0101)**
| Remessa | Retorno | Uso |
|---|---|---|
| 607 (5908/6908, estoque S, poder de terceiros R) | 407 (1909/2909, tipo B, poder D) | locação feita no Protheus em 2026 |
| 606 (5908/6908, estoque S, poder R) | 406 (tipo B, poder D) | comodato feito no Protheus em 2026 |
| 906 (5908/6908, estoque N, sem poder de terceiros) | 456 (tipo D, estoque S) | remessa do ERP antigo lançada na MATA920 |

Há também 250/251 (entrada de comodato), 950/951 (retorno de bem recebido) e 610 (conserto), fora do escopo.

**Retornos (entradas x909), jan-ago/2026:** 553 NFs (≈ 70/mês) e 576 itens.
- Entrada própria (`F1_FORMUL = S`): ≈ 363 NFs. NF do cliente: ≈ 190.
- **Toda entrada movimenta estoque** (`D1_NUMSEQ` preenchido), inclusive a própria, que é emitida **antes da coleta**: o saldo entra no armazém antes de o equipamento chegar.
- Armazém: **02 RECEBIMENTO** (331 itens), **06 EXPEDIÇÃO** (237), 01 (8).
- NF do cliente: a digitação pode ser bem depois da emissão (ex.: emissão 21/05, digitação 05/08).
- `D1_ORIGLAN = LF` (lançamento fiscal manual) em ≈ 26 NFs; o resto pela rotina normal.

**Ligação com a remessa:** quase todas as entradas têm `D1_NFORI`.
- 483 itens apontam remessa **sem pedido** (TES 906, MATA920): o equipamento ficou ≈ 500 dias no cliente (de 26 a 2.436).
- 57 itens apontam remessa **com pedido** (606/607 de 2026): de 1 a 182 dias. As REM com TES 606 voltam em ≈ 17 dias.
- 35 itens com `D1_NFORI` cuja remessa não foi achada (NF antiga não lançada ou número diferente).

**Equipamentos no cliente (remessa menos o que voltou pelo `D1_NFORI`)**
- 2026, TES 607 LOC: 920 unidades enviadas, 50 voltaram, **870 no cliente** (662 itens).
- 2026, TES 606/607 REM: 83 no cliente; VEN/VAV com TES 607: 11 (a conferir).
- As remessas antigas (906) só existem no Protheus quando voltam, então o saldo delas (≈ 79) é resto de retorno parcial ou de item que não casou.
- 606/607 controlam **poder de terceiros** (F4_PODER3 R/D): o saldo das remessas de 2026 também deve estar na SB6.

**Frete cobrado das locações:** dos 708 pedidos LOC de 2026, **nenhum tem `C5_FRETE`**; 398 têm `C5_ZFRETE`. O frete (ida + volta) está no **frete não destacado**.

**CTEs de entrada (jan-ago/2026):** 3.135 CTEs (≈ 390/mês), R$ 1,6 mi; 350 são complementares (tipo C). Todos com chave, menos 1. TES 205, CFOP 1352/2352 (e 1932/2932, 1353/2353). Maiores: Jamef (1.424), Multi Service (555, o maior valor), Movvi (531), Azul (371), Bertolini (61).
- **CTEs da ZLC no fiscal:** 2.566 linhas na ZLC; 2.049 achadas no fiscal pelo número, 2.024 com o mesmo valor. A ZLC vai até 12/11 e o fiscal da homologação só até agosto: na produção a taxa deve ser maior.
- **XML do importador existe:** SDS (7.113 documentos, com `DS_CHAVENF`, `DS_TPCTE`, `DS_CHVNFOR`) e SDT (10.755 itens, com `DT_CHVNFO`). Se o CTE importado guarda a chave da NF transportada, **o CTE pode ser ligado sozinho** à NF de saída (pedido) ou à NF de entrada própria (reversa). A conferir num próximo diagnóstico.
- CKO e C00 não existem.

**Nomes Z em uso:** Z01, ZDM, ZFM, ZGM, ZGZ, ZHE, ZLC, ZLH, ZXA, ZXB (e ZAUDIT). Livres para a reversa: ZLR, ZLI, ZLQ.

## Cadastro da coleta (proposta de 24/11/2026, aprovada como beta)

Botão **Nova coleta** na aba Reversa:
1. **Cliente:** digitar o CNPJ (ou código/nome). A tela busca no SA1 e mostra nome, endereço de coleta, cidade/UF e telefone.
2. **Equipamentos no cliente:** remessas de locação/comodato daquele cliente que ainda não voltaram (CFOP x908, TES 607/906), com NF, data, produto, quantidade e números de série da Z01 (só as de 2026). A logística marca o que volta e quanto (retorno parcial). Equipamento do ERP antigo, que não está no Protheus, entra à mão: produto, quantidade e séries.
3. **Solicitação:** data do e-mail, quem pediu (nome, e-mail, telefone), séries informadas no e-mail e observação.
4. **Cotação:** transportadora escolhida, valor cotado e data agendada da coleta.

Etapas: **Solicitada** → **Coleta agendada** (transportadora e data) → **NF emitida / coletada** (a NF de entrada x909 do cliente é ligada sozinha, ou o número é digitado) → **Recebida** (entrada do fiscal com saldo no armazém; automática, se o diagnóstico mostrar como reconhecer) → encerrada.

O custo real (CTE) entra nos custos de frete (ZLC) com o tipo reversa. O frete cobrado vem do pedido da remessa, que já inclui a volta: a tela mostra **cobrado (ida + volta) × custo da ida + custo da volta**.

Tabelas novas: cabeçalho da reversa e itens (equipamentos), criadas pelo compatibilizador, como a ZLC/ZLH.

## Como o retorno de locação é lançado (usuário, 24/11/2026)

- O Protheus começou a operar no **início de 2026**. As locações anteriores foram feitas no **ERP antigo**.
- **Quando o produto de locação volta:**
  1. É feita a **NF de saída** no Protheus.
  2. **Se o cliente emite a NF de devolução:** a empresa dá entrada nessa NF, **vinculada à NF de saída**.
  3. **Se o cliente não emite:** a própria empresa faz a entrada, **amarrando a saída e a entrada**.

**Passo a passo do lançamento (usuário, 24/11/2026; exemplo em que o cliente não emite NF):**

| Passo | Rotina | O que é | Dados |
|---|---|---|---|
| 1. Registrar a remessa do sistema antigo | **MATA920** (NF de saída manual, sem pedido de venda) | A NF de saída emitida pela ATM no ERP antigo | tipo N; formulário próprio = sim; número, série e **data da NF antiga**; cliente; espécie SPED; item, quantidade, **TES 906 / CFOP 6908** (remessa de bem em comodato ou locação) |
| 2. Entrada de retorno feita pela empresa | **MATA910** (NF de entrada manual) | NF de entrada **emitida pela empresa**, que também **acompanha o transporte** | tipo **Devolução**; formulário próprio = sim; número automático; data de emissão = hoje; mesmo cliente e espécie; mesmo item; **TES 456 / CFOP 2909** (retorno de bem em comodato ou locação); **Docto. Orig. (`D1_NFORI`) = NF do passo 1** |

**Quando a remessa saiu pelo Protheus e o cliente emite a NF de devolução (usuário, 24/11/2026):**

| Rotina | Dados |
|---|---|
| **MATA103** (documento de entrada) | tipo **Devolução**; formulário próprio = **não**; número, série e data de emissão **da NF do cliente**; cliente; na linha, o produto da NF, **amarrado à NF de saída do Protheus** (`D1_NFORI`/`D1_SERIORI`/`D1_ITEMORI`). TES não informada (a conferir no diagnóstico; provavelmente a 456 / CFOP 1909/2909). |

Então a entrada de retorno tem dois caminhos, e os dois levam à NF de remessa pelo mesmo vínculo:
- **MATA103:** NF do cliente, formulário próprio = não.
- **MATA910:** entrada própria, formulário próprio = sim, emitida na coleta e acompanhando o transporte.

**Datas da MATA103:** a emissão (`F1_EMISSAO`) é a da NF do cliente, ou seja, quando a mercadoria saiu de lá (coleta). A digitação (`F1_DTDIGIT`) tende a ser a chegada. Se o diagnóstico confirmar, nesse caso a reversa já sai com "coletada" e "recebida" sem digitação. Na MATA910, a chegada continua dependendo de a logística confirmar.

**O que isso muda no desenho:**
- **A hipótese da manhã de 24/11 estava errada.** A NF do passo 1 vem da MATA920, que **não tem pedido de venda**. Então ela não aparece na tela de saídas, que parte da SC5/SC6, e não está nos "Faturados parados". A conferir no diagnóstico.
- **Regra para achar a reversa:** CFOP **x908** (5908/6908) = remessa de comodato ou locação; **x909** (1909/2909) = retorno. A entrada x909 aponta a remessa x908 pelo `D1_NFORI`/`D1_SERIORI`. Vale para as remessas antigas (MATA920, sem pedido) e para as de 2026 (pedido de venda).
- **A reversa fica ligada à NF de remessa** (documento, série e cliente), não ao `C5_NUM`, porque as remessas antigas não têm pedido. O frete cobrado (ida + volta) só existe nas remessas de 2026, que têm pedido.
- **A entrada própria é emitida na coleta, não na chegada:** ela viaja com a mercadoria. Então ela marca **"coletado / em trânsito"**. O **recebimento físico** é confirmado pela logística na tela, com a data de chegada.
- **CTE da reversa:** se a entrada própria é NF-e (espécie SPED), o CTE da transportadora cita a chave dela. O vínculo pode ser automático, se o XML do CTE ficar na base.
- **Equipamentos no cliente:** remessas x908 sem retorno x909. Só as de 2026 aparecem antes do retorno, porque as antigas só são lançadas na MATA920 na hora em que voltam.

## Análise e desenho proposto

**Reversa ligada ao pedido de saída original**
- O frete cobrado do cliente (ida + volta) está no pedido de remessa. Então a reversa fica ligada a esse pedido (tipo LOC/COM no `C5_ZTPPEDI`).
- Hoje o "Cobrado − custo" dos pedidos de locação e comodato **parece melhor do que é**: conta o frete cobrado inteiro contra só o custo da ida. Com a reversa, o pedido original soma o custo da volta.
- Dá para mostrar o "frete de retorno já recebido e ainda não usado" dos equipamentos que estão no cliente.

**Aba Reversa na mesma tela, com quadros próprios**
- Quadros: Solicitada → Coleta agendada → Coletada / em trânsito → Recebida (NF de entrada lançada).
- Cadastro a partir do e-mail: data, quem pediu, cliente e remessa ou equipamento.
- Lista de **equipamentos no cliente**: remessas LOC/COM faturadas que não voltaram, com os números de série da Z01.
- Fechamento automático, se a NF de entrada do retorno apontar a NF original (`D1_NFORI`).

**Tabelas**
- Tabela nova para a reversa (cabeçalho + equipamentos), porque não existe pedido para ela.
- A ZLC (custos) e a ZLH (histórico) ganham um **tipo de documento** (V = venda, R = reversa, C = compra) e uma chave genérica, no lugar de ficarem só no `C5_NUM`.

**Conferência de CTEs (fiscal × logística)**
- Como o CTE é lançado no Protheus sem amarração, ele já está na base, com número, transportadora (fornecedor SA2), valor e data. Falta dizer a que pedido pertence.
- **CTEs a vincular:** fila dos CTEs lançados no fiscal que não estão ligados a nada. A logística escolhe se cada um é de uma saída, de uma reversa ou de uma compra, e o valor vem pronto.
- Ajuda também a saída já existente: cruza os CTEs digitados na ZLC (3.509 em 19/11) com os lançados no fiscal. Mostra o digitado e não lançado, o lançado e não vinculado, e o mesmo CTE com valor diferente.
- Se o XML do CTE estiver guardado na base, ele traz a chave da NF transportada, e o vínculo pode ser automático.
- **Atenção:** na saída, a transportadora vem do SA4. No CTE de entrada, quem emite é um fornecedor (SA2). A ligação entre os dois cadastros seria pelo CNPJ.

**Compras:** prioridade baixa, porque quem paga costuma ser o fornecedor. Só entra se o diagnóstico mostrar frete pago pela empresa em volume que justifique.

## Ordem sugerida

1. **Diagnóstico só de leitura.** Exige um endpoint de consulta para compilar, no molde do diagnóstico do HISTEVT. Ele levanta (com as respostas de 24/11):
   - entradas de retorno (CFOP 1909/2909, TES 456) por mês: NF do cliente × entrada própria (`F1_FORMUL`), `F1_TIPO`, armazém (`D1_LOCAL`), se o `D1_NFORI` está preenchido;
   - a remessa apontada (CFOP 5908/6908): com ou sem pedido (`D2_PEDIDO`: MATA920 = sem), TES, data da NF e dias até o retorno;
   - remessas x908 de 2026 sem retorno (futura lista de equipamentos no cliente);
   - CTEs de entrada por mês, por transportadora, com espécie e TES usadas;
   - quantos desses CTEs batem com a ZLC;
   - se o XML do CTE fica guardado;
   - remessas LOC/COM no cliente;
   - se a NF de retorno aponta a remessa (`D1_NFORI`) e em qual armazém o equipamento entra;
   - se o `C5_FRETE`/`C5_ZFRETE` das remessas LOC/COM inclui o retorno.
2. Conferência de CTEs (fiscal × logística).
3. Aba Reversa.
4. Compras, se justificar.

## Perguntas em aberto (o usuário vai estudar)

- Como a equipe de faturamento lança a NF, tanto a de entrada do retorno quanto o CTE, e como cruzar essas informações no Protheus.
- O frete de retorno vem somado no `C5_FRETE`/`C5_ZFRETE` da remessa ou é cobrado à parte?
- ~~Pode haver retorno parcial?~~ Respondido em 24/11: sim, e só é feita a entrada parcial. **Ideia do usuário:** um campo para os **números de série que voltam**, porque nas NFs do ERP antigo o Protheus não tem as séries (a Z01 só tem as de 2026).
- ~~Quem lança a NF de entrada do retorno, e ela é lançada informando a NF de saída original?~~ Respondido em 24/11: sempre vinculada à NF de saída (do cliente ou entrada própria).
- ~~Confirmar a saída das locações antigas~~ Respondido em 24/11: MATA920, TES 906 / CFOP 6908, com os dados da NF antiga.
- ~~Quando o cliente emite a NF de devolução, qual rotina?~~ Respondido em 24/11: MATA103 (Devolução, formulário próprio = não, dados da NF do cliente, item amarrado à NF de saída). TES: **456**, a mesma da MATA910 (respondido em 24/11).
- ~~Combinações cruzadas existem?~~ Respondido em 24/11: **sim**. Por exemplo, remessa antiga lançada na MATA920 com retorno pela NF do cliente na MATA103.
- ~~Remessas feitas no Protheus em 2026: qual TES?~~ Respondido em 24/11: **TES 607**.
- Na chegada do equipamento existe algum registro no Protheus (conferência, transferência de armazém), ou só a logística sabe?
- Depois que o equipamento chega, existe conferência técnica (armazém de conserto) que a logística acompanha, ou "recebido" encerra?
