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

**Como entendi (a confirmar com o usuário):**
- Para as locações do ERP antigo, a NF de saída é emitida no Protheus **no momento do retorno**, só para regularizar: dar uma NF de origem para a entrada apontar.
- Para as locações feitas no Protheus em 2026, a saída é a própria remessa original.

**O que isso muda no desenho:**
- **Fechamento automático da reversa:** viável. Nos dois casos, a NF de entrada aponta a NF de saída. É o caminho `D1_NFORI`/`D1_SERIORI` → SD2 → `D2_PEDIDO` → pedido. A NF do cliente e a entrada própria (`F1_FORMUL = 'S'`) seguem esse mesmo caminho.
- **Locações do ERP antigo não estão no Protheus antes do retorno:**
  - a lista "equipamentos no cliente" só enxerga as remessas de 2026;
  - a reversa de uma locação antiga começa pelo e-mail **sem pedido no Protheus**, com cliente e equipamento ou série digitados;
  - ela é amarrada quando a NF de saída de regularização existir.
- **A tela de saídas pode estar mostrando essas NFs de regularização como "Faturados parados".** Elas são saídas com NF e sem envio, mas nada sai fisicamente. É preciso descobrir como identificá-las (tipo de pedido, TES ou CFOP) para tirá-las das saídas e levá-las para a reversa.


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
   - NFs de entrada com `D1_NFORI` apontando uma saída: por mês, NF do cliente × entrada própria (`F1_FORMUL`), `F1_TIPO`, TES, CFOP e armazém (`D1_LOCAL`);
   - a saída apontada: tipo de pedido (`C5_ZTPPEDI` LOC/COM), TES, CFOP, data; e se foi emitida perto da entrada (regularização do ERP antigo) ou meses antes (remessa de 2026);
   - quantas dessas saídas estão hoje na tela de saídas como faturado sem envio;
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
- **Confirmar:** nas locações do ERP antigo, a NF de saída é emitida só no retorno, para regularizar? Com qual tipo de pedido, TES ou CFOP?
- Exemplos reais para o diagnóstico: o número de um retorno com NF do cliente e de um com entrada própria.
- Depois que o equipamento chega, existe conferência técnica (armazém de conserto) que a logística acompanha, ou "recebido" encerra?
