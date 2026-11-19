# Comunicado: apresentação da tela de Logística (19/11/2026)

E-mail para a logística e a gestão, no mesmo padrão do comunicado do RX Pedidos. **Os prints usam dados fictícios.**

## Arquivos

| Arquivo | Uso |
|---|---|
| `email-gmail.html` | **Para enviar pelo Gmail.** As imagens estão dentro do arquivo. Abrir no Chrome, Ctrl+A, Ctrl+C e colar no corpo do e-mail. Mandar um teste para você antes. |
| `email.html` | A mesma página com as imagens ao lado (`*.png`). Serve para outros clientes de e-mail e para editar. |
| `email.txt` | Só o texto, com a marca de onde entra cada imagem. |
| `Logistica no Protheus - apresentacao.pdf` | O comunicado em PDF, para anexar ou imprimir. |
| `01-quadros.png` … `07-custo-x-cobrado.png` | Os prints, na ordem em que aparecem. |
| `vs_logo.png`, `totvs_logo.png` | Logos do cabeçalho. |
| `_gerador/` | Scripts para refazer os prints e o e-mail. |

## Conteúdo

1. **Resumo:** o que a tela faz.
2. **Como foi feito, tudo no Protheus:** os campos novos no pedido de venda (SC5), a tabela de custos de frete (ZLC), a tabela de histórico (ZLH) e o que o Protheus já tinha. Destaque: a planilha ENVIOS 2026 já está no Protheus, com os CTEs conferidos e as marcas "Importação" e "Carga inicial" no histórico. Bom saber: remessa por conta e ordem, entregas parciais e importação.
3. **A tela, aba por aba:** Quadros, Programação (com as entregas previstas para hoje e o botão Entregue), detalhe do pedido, custos de frete, histórico, cliente com telefone, Lista, Exportar XLSX e Indicadores.
4. **Os dados também saem por API:** exemplo do CRM para os vendedores.
5. **Próximo passo:** APIs das transportadoras, para rastreio e cotação.

O texto de abertura foi pedido pelo usuário: "Como foi feito na RX Pedidos, avançamos para a logística para 'exterminar' a dependência de planilhas e ter uma única base de dados e de consulta: o Protheus".

## Como refazer

Precisa de Node 24, Python com Pillow e do Chrome instalado. Os comandos rodam a partir da pasta `app` do LOGREL.

1. Suba a API falsa com os dados fictícios: `node ..\Comunicados\2026-11-apresentacao-logistica\_gerador\mock2.cjs` (porta 3998).
2. Suba a tela apontando para ela: `$env:LOGREL_REST = "http://localhost:3998"` e `npx ng serve --port 4298 --proxy-config proxy.conf.cjs`.
3. Capture os prints. Junte o `base.mjs` (as funções do Chrome headless) com o roteiro e rode, passando a pasta de saída e uma pasta de perfil do Chrome:
   - `passos-prints.mjs`: telas do detalhe do pedido (custos, histórico, cliente);
   - `passos-entregue.mjs`: o quadro "Entregas previstas para hoje".

   Quadros, Programação, Lista, Exportar XLSX e Indicadores saíram da primeira versão do roteiro, que tirava a tela inteira. Os recortes foram feitos com Pillow.
4. Gere o e-mail: `python _gerador\gerar_log.py <esta pasta>`. Ele escreve `email.html`, `email-gmail.html` e `email.txt`.
5. Gere o PDF: Chrome headless com `--print-to-pdf` sobre o `email.html`.
