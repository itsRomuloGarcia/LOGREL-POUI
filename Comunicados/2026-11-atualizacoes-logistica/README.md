# Comunicado: atualizações da tela de Logística (25/11/2026)

E-mail **separado** da apresentação de 19/11 (`../2026-11-apresentacao-logistica/`, que fica como foi enviada). Pedido do usuário em 25/11/2026: "um arquivo separado falando das atualizações, a apresentação eu enviei em 19/11" e "não deixe nada de fora". Mesmo padrão visual. **Os prints usam dados fictícios.**

## Arquivos

| Arquivo | Uso |
|---|---|
| `email-gmail.html` | **Para enviar pelo Gmail.** As imagens estão dentro do arquivo. Abrir no Chrome, Ctrl+A, Ctrl+C e colar no corpo do e-mail. Mandar um teste para você antes. |
| `email.html` | A mesma página com as imagens ao lado (`*.png`). |
| `email.txt` | Só o texto, com a marca de onde entra cada imagem. |
| `Logistica no Protheus - atualizacoes 25-11.pdf` | O comunicado em PDF, para anexar ou imprimir. |
| `*.png` | Os prints usados: `03f-envios`, `03h-finalizar`, `03g-sem-cte`, `01-quadros`, `02-programacao`, `03a-detalhe`, `03e-cliente-itens`, `05-exportar-xlsx`, e os logos. |
| `_gerador/` | `mock5.cjs` (API falsa), `base.mjs` + `passos-25-11.mjs` (prints), `gerar_atualizacao.py` (e-mail). |

## Conteúdo (tudo o que entrou depois da apresentação de 19/11, conferido com o CLAUDE.md)

1. **Resumo do que mudou.**
2. **Na tela:**
   - envios parciais (25/11, com a regra das NFs do mesmo dia);
   - finalizar sem entrega com reembolso, observação do retorno e indicador "Outros" (23/11 e 24/11);
   - Sem CTE e qualquer cobrança resolvendo a pendência (24/11);
   - Quadros: Enviados hoje, cartões que filtram, informação faltando, busca exata, entregues antigos na busca e atualização automática (23/11 e 24/11);
   - Programação: filtro do "Não saíram" e cartões que levam à coluna (23/11);
   - tipo do frete (25/11), endereço e mensagem para a nota (23/11);
   - Exportar XLSX: aba Envios e recorte dos finalizados;
   - outros ajustes: período automático (23/11), colunas novas na Lista, envios nos Indicadores, TES 610 (19/11) e ajustes visuais (24/11);
   - planilha Google (22/11).
3. **No Protheus:** a tabela nova de envios (ZLE), a NF na cobrança (`ZLC_NF`), o que a ZLH passou a guardar e os campos do pedido que só passaram a aparecer.

Ficou de fora, de propósito, a logística reversa: ainda está em estudo (`IDEIAS-REVERSA-E-CTE.md`) e não está na tela.

## Como refazer

Os comandos rodam a partir da pasta `app` do LOGREL. Precisa de Node 24, Python e do Chrome.

1. API falsa: `node ..\Comunicados\2026-11-atualizacoes-logistica\_gerador\mock5.cjs` (porta 3998; "hoje" = 25/11/2026; 004720 em 2 NFs, 004760 com Sem CTE, 004777 finalizado por extravio, 004750 com indicador "Outros").
2. Tela: `$env:LOGREL_REST = "http://localhost:3998"` e `npx ng serve --port 4298 --proxy-config proxy.conf.cjs`.
3. Prints: junte `base.mjs` e `passos-25-11.mjs` num arquivo só e rode `node <arquivo> <pasta de saída> <pasta de perfil do Chrome>`. Ele gera os 15 prints da tela (este e-mail usa 8). Os Quadros saem em 1600 px, porque as 6 colunas só aparecem acima de 1500 px.
4. E-mail: `python _gerador\gerar_atualizacao.py <esta pasta>`.
5. PDF: Chrome headless com `--print-to-pdf` e `--no-pdf-header-footer` sobre o `email.html`.
