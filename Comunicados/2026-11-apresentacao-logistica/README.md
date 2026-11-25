# Comunicado: apresentação da tela de Logística (19/11/2026, atualizado em 25/11/2026)

E-mail para a logística e a gestão, no mesmo padrão do comunicado do RX Pedidos. **Os prints usam dados fictícios.**

**Atualização de 25/11/2026** (pedido do usuário: "todas as atualizações feitas não foram atualizadas no comunicado que enviei"):
o e-mail ganhou, logo depois da abertura, o quadro "Atualizado em 25/11/2026: o que mudou desde o primeiro envio", e o texto
e os prints foram refeitos com a tela de 25/11 (API `2026-11-25b`): envios parciais, finalizar sem entrega (extravio e reembolso),
Sem CTE, coluna Enviados hoje, cartões que filtram, informação faltando, atualização automática, tipo do frete, endereço e
mensagem para a nota, observação do retorno, indicador "Outros", filtro do "Não saíram", aba Envios do XLSX e a planilha Google.

## Arquivos

| Arquivo | Uso |
|---|---|
| `email-gmail.html` | **Para enviar pelo Gmail.** As imagens estão dentro do arquivo. Abrir no Chrome, Ctrl+A, Ctrl+C e colar no corpo do e-mail. Mandar um teste para você antes. |
| `email.html` | A mesma página com as imagens ao lado (`*.png`). Serve para outros clientes de e-mail e para editar. |
| `email.txt` | Só o texto, com a marca de onde entra cada imagem. |
| `Logistica no Protheus - apresentacao.pdf` | O comunicado em PDF, para anexar ou imprimir. |
| `01-quadros.png` … `07-custo-x-cobrado.png` | Os prints, na ordem em que aparecem. Novos em 25/11: `03f-envios.png` (envios parciais), `03g-sem-cte.png` e `03h-finalizar.png`. |
| `vs_logo.png`, `totvs_logo.png` | Logos do cabeçalho. |
| `_gerador/` | Scripts para refazer os prints e o e-mail. |

## Conteúdo

1. **Resumo:** o que a tela faz.
2. **Como foi feito, tudo no Protheus:** os campos novos no pedido de venda (SC5), a tabela de custos de frete (ZLC), a de envios do pedido (ZLE), a de histórico (ZLH, que também guarda a observação do retorno, a finalização e a descrição do indicador "Outros") e o que o Protheus já tinha. Destaque: a planilha ENVIOS 2026 já está no Protheus, com os CTEs conferidos e as marcas "Importação" e "Carga inicial" no histórico. Bom saber: remessa por conta e ordem, pedido em mais de uma NF e importação.
3. **A tela, aba por aba:** Quadros, Programação (com as entregas previstas para hoje e o botão Entregue), detalhe do pedido (com o tipo do frete), envios parciais, custos de frete (com Sem CTE), finalizar sem entrega, histórico, cliente com endereço, telefone e mensagem para a nota, Lista, Exportar XLSX, Indicadores e a planilha Google.
4. **Os dados também saem por API:** exemplo do CRM para os vendedores.
5. **Próximo passo:** APIs das transportadoras, para rastreio e cotação.

O texto de abertura foi pedido pelo usuário: "Como foi feito na RX Pedidos, avançamos para a logística para 'exterminar' a dependência de planilhas e ter uma única base de dados e de consulta: o Protheus".

## Como refazer

Precisa de Node 24, Python e do Chrome instalado (desde 25/11 os recortes saem direto do Chrome; o Pillow não é mais preciso). Os comandos rodam a partir da pasta `app` do LOGREL.

**Versão de 25/11/2026 (a atual):**

1. API falsa: `node ..\Comunicados\2026-11-apresentacao-logistica\_gerador\mock5.cjs` (porta 3998; "hoje" = 25/11/2026). É o `mock2.cjs` com endereço, mensagem da nota, envios parciais (004720 em 2 NFs), tipo do frete, Sem CTE (004760), finalizado por extravio (004777) e indicador "Outros".
2. Tela: `$env:LOGREL_REST = "http://localhost:3998"` e `npx ng serve --port 4298 --proxy-config proxy.conf.cjs`.
3. Prints: junte o `base.mjs` com o `passos-25-11.mjs` num arquivo só e rode com a pasta de saída e uma pasta de perfil do Chrome. Ele gera os 15 prints (Quadros em 1600 px, porque as 6 colunas só aparecem acima de 1500 px).
4. `python _gerador\gerar_log.py <esta pasta>` e o PDF como abaixo.

**Versão de 19/11/2026 (referência):**

1. Suba a API falsa com os dados fictícios: `node ..\Comunicados\2026-11-apresentacao-logistica\_gerador\mock2.cjs` (porta 3998).
2. Suba a tela apontando para ela: `$env:LOGREL_REST = "http://localhost:3998"` e `npx ng serve --port 4298 --proxy-config proxy.conf.cjs`.
3. Capture os prints. Junte o `base.mjs` (as funções do Chrome headless) com o roteiro e rode, passando a pasta de saída e uma pasta de perfil do Chrome:
   - `passos-prints.mjs`: telas do detalhe do pedido (custos, histórico, cliente);
   - `passos-entregue.mjs`: o quadro "Entregas previstas para hoje".

   Quadros, Programação, Lista, Exportar XLSX e Indicadores saíram da primeira versão do roteiro, que tirava a tela inteira. Os recortes foram feitos com Pillow.
4. Gere o e-mail: `python _gerador\gerar_log.py <esta pasta>`. Ele escreve `email.html`, `email-gmail.html` e `email.txt`.
5. Gere o PDF: Chrome headless com `--print-to-pdf` sobre o `email.html`.
