# Ideia em estudo: logística reversa e CTEs de entrada

**Situação (24/11/2026): só ideia. Nada foi implementado nem alterado.** Em 24/11 o usuário explicou como o retorno de locação é lançado (seção abaixo). O usuário vai estudar como o faturamento lança as NFs e como cruzar essas informações no Protheus. Com as respostas dele, a conversa continua deste ponto.

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
- Pode haver retorno parcial (só parte dos equipamentos)?
- ~~Quem lança a NF de entrada do retorno, e ela é lançada informando a NF de saída original?~~ Respondido em 24/11: sempre vinculada à NF de saída (do cliente ou entrada própria).
- ~~Confirmar a saída das locações antigas~~ Respondido em 24/11: MATA920, TES 906 / CFOP 6908, com os dados da NF antiga.
- Quando o cliente emite a NF de devolução: a entrada é pela MATA910 ou pelo documento de entrada (MATA103)? Com a TES 456?
- Remessas feitas no Protheus em 2026: pedido de venda com qual TES (também a 906)?
- Na chegada do equipamento existe algum registro no Protheus (conferência, transferência de armazém), ou só a logística sabe?
- Depois que o equipamento chega, existe conferência técnica (armazém de conserto) que a logística acompanha, ou "recebido" encerra?
