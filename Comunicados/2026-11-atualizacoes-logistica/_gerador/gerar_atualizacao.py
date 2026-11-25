# Comunicado das atualizacoes da tela de Logistica (25/11/2026), separado da apresentacao de 19/11.
# Gera email.html, email-gmail.html (imagens dentro) e email.txt. Uso: python gerar_atualizacao.py <pasta>
import sys, io, html, os, re, base64

D = sys.argv[1]

TITULO = "Logística no Protheus: o que mudou desde a apresentação"
INTRO = [
    "Na apresentação de 19/11 mostrei a tela <b>Logística · Pedidos de entrega</b>. Desde então, ela recebeu melhorias "
    "que surgiram no uso do dia a dia, e <b>todas já estão na produção</b>.",
    "Abaixo, o que mudou e onde encontrar cada coisa na tela. <i>Os prints usam dados fictícios.</i>",
]

RESUMO = [
    ("Envios parciais", "O pedido faturado em partes tem um envio por NF, cada um com datas, transportadora, CTE e frete próprios."),
    ("Finalizar sem entrega", "Extravio, mercadoria enviada em outro pedido ou outro motivo, com o controle do reembolso."),
    ("Sem CTE", "Cobrança de frete sem CTE (frete pago sem documento ou retirada pelo cliente). Qualquer cobrança resolve a pendência de CTE."),
    ("Quadros", "Coluna <b>Enviados hoje</b>, cartões que filtram ao clicar, filtro de informação faltando em cada coluna e atualização automática."),
    ("Programação", "Filtro na coluna “Não saíram” e cartões do topo que levam direto à coluna."),
    ("Detalhe do pedido", "Tipo do frete, endereço de entrega, mensagem para a nota, observação do retorno e o indicador “Outros” com a descrição."),
    ("Exportar XLSX", "Aba nova <b>Envios</b> (uma linha por NF) e o recorte “Finalizados sem entrega”."),
    ("Planilha Google", "Ligada ao Protheus e atualizada a cada 15 minutos, só para consulta."),
    ("Outros ajustes", "Período automático, colunas novas na Lista, envios nos Indicadores, pedidos da TES 610 e ajustes visuais."),
]

# (titulo, [paragrafos/listas], [(imagem, alt, largura)])
SECOES = [
    ("Envios parciais: cada NF é um envio", [
        "Quando o pedido é faturado em partes, cada NF passa a ser um envio. O 1º continua em “Envio e entrega”; cada NF seguinte "
        "ganha o seu bloco no detalhe do pedido, com:",
        [
            "data de envio, previsão da transportadora e data de entrega;",
            "tipo de material e indicador de atraso;",
            "transportadora, que pode ser outra que a do 1º envio;",
            "o CTE e o frete daquele envio, pelo botão <b>+ Cobrança deste envio</b>. A lista de custos mostra a qual envio cada cobrança pertence.",
        ],
        "O botão <b>Salvar envio</b> grava só aquele bloco. O pedido só vai para Entregues quando todas as NFs foram entregues, e o "
        "cartão mostra quantos envios já saíram (“1 de 2 envios”). O prazo do pedido é o do envio mais atrasado, a informação "
        "faltando é conferida em cada NF, a linha do tempo mostra cada envio e o pedido entra em Enviados hoje quando qualquer "
        "envio dele sai no dia.",
        "<b>NF emitida no mesmo dia da primeira</b> conta como o mesmo envio, automaticamente. Se ela não saiu junto, o botão "
        "<b>Não saiu junto: registrar envio separado</b> abre o bloco dela.",
    ], [("03f-envios.png", "Pedido em 2 NFs: o 1º envio, o bloco do 2º envio e os custos de cada um", 680)]),
    ("Finalizar sem entrega", [
        "Para o pedido que não vai ter data de entrega: <b>extravio</b>, mercadoria <b>enviada em outro pedido</b> ou outro motivo. "
        "Marcada a caixa, o pedido sai dos quadros em aberto e da Programação, vai para a coluna <b>Retornados e finalizados</b> "
        "e não entra no % de entregas no prazo.",
        "No extravio fica registrado o reembolso: pendente, reembolsado ou sem reembolso, com o valor e a data. O cartão "
        "<b>Reembolsos pendentes</b>, nos Quadros, mostra os extravios que ainda não foram resolvidos.",
        "Também no detalhe do pedido:",
        [
            "o <b>retorno à empresa</b> ganhou uma observação: o que voltou, o estado da mercadoria, o combinado com o cliente;",
            "o indicador de atraso ganhou a opção <b>Outros</b>, com um campo para descrever o que aconteceu.",
        ],
        "Extravio sem reembolso resolvido e indicador “Outros” sem descrição também aparecem como informação faltando.",
    ], [("03h-finalizar.png", "Finalizar sem entrega: extravio com reembolso pendente", 680)]),
    ("Custos de frete: Sem CTE", [
        "Quando não há CTE, a cobrança pode ser lançada com a opção <b>Sem CTE</b>: com valor, é frete pago sem o documento; com valor "
        "zero, é movimentação sem cobrança (por exemplo, retirada pelo cliente na fábrica).",
        "E <b>qualquer cobrança lançada</b>, de qualquer tipo, tira o pedido da pendência “falta CTE ou custo de frete”. Antes, só a "
        "cobrança do tipo Envio contava.",
    ], [("03g-sem-cte.png", "Cobrança marcada como Sem CTE", 640)]),
    ("Quadros", [
        [
            "<b>Coluna Enviados hoje:</b> tudo o que saiu hoje, com a etapa de cada pedido.",
            "<b>Cartões que filtram:</b> um clique em qualquer cartão do topo mostra só aqueles pedidos (informação faltando, saíram hoje, "
            "atrasados, faturados parados, reembolsos pendentes…); outro clique volta a mostrar todos.",
            "<b>Informação faltando:</b> cada coluna tem esse filtro, e o cartão do pedido mostra o que falta (transportadora, peso, data "
            "de envio, CTE…).",
            "<b>Busca pelo número do pedido:</b> mostra só aquele pedido. Antes, “000287” trazia também as NFs que tinham esse número no meio.",
            "<b>Entregues antigos:</b> a coluna Entregues mostra os últimos 30 dias, com o botão “Mostrar também os mais antigos”; com a "
            "busca preenchida, aparecem todos, mesmo entregues há meses.",
            "<b>Atualização automática:</b> desligada, 5, 10 ou 15 minutos. A tela busca os dados de novo sozinha e espera enquanto há um "
            "pedido aberto.",
        ],
    ], [("01-quadros.png", "Aba Quadros com a coluna Enviados hoje e os cartões que filtram", 836)]),
    ("Programação", [
        "A coluna <b>Não saíram</b> ganhou um filtro próprio (pedido, cliente, cidade), e os cartões do topo (saem hoje, não saíram, "
        "entregas previstas hoje, com NF sem programação) levam direto à coluna.",
    ], [("02-programacao.png", "Aba Programação com o filtro da coluna Não saíram", 836)]),
    ("Detalhe do pedido: tipo do frete, endereço e mensagem para a nota", [
        "Em Dados do pedido entrou o <b>tipo do frete</b> (CIF, FOB, por conta de terceiros, do remetente, do destinatário ou sem frete). "
        "Como a transportadora, o volume, a espécie e os pesos, ele é preenchido antes da NF, porque sai na nota.",
    ], [("03a-detalhe.png", "Detalhe do pedido com o tipo do frete", 680)]),
    (None, [
        "Em Cliente e pedido aparecem o <b>endereço de entrega</b> e a <b>mensagem para a nota</b> do pedido, só para consulta.",
    ], [("03e-cliente-itens.png", "Cliente e pedido com o endereço de entrega e a mensagem para a nota", 680)]),
    ("Exportar XLSX", [
        "A planilha exportada ganhou a aba <b>Envios</b>, com uma linha por NF, e o recorte <b>Finalizados sem entrega</b>. As colunas "
        "novas (tipo do frete, informação faltando, finalização, reembolso) também saem na aba Pedidos e na Lista completa.",
    ], [("05-exportar-xlsx.png", "Janela do Exportar XLSX com a aba Envios", 520)]),
    ("Outros ajustes", [
        [
            "<b>Período automático:</b> a tela carrega sozinha de 1º de janeiro do ano anterior até hoje. A linha “Consultar no "
            "Protheus” saiu do topo.",
            "<b>Lista completa:</b> colunas novas de tipo do frete, informação faltando, finalização (motivo, data, pedido, reembolso) "
            "e descrição do indicador “Outros”. No pedido faturado em partes, cada item mostra os dados do envio da sua NF. No CSV da "
            "Lista, a data do retorno sai formatada.",
            "<b>Indicadores:</b> no pedido faturado em partes, cada NF conta como um envio; o pedido finalizado sem entrega não entra "
            "no % no prazo.",
            "<b>TES 610:</b> os pedidos com a TES 610, usada no início da operação, passaram a aparecer na tela.",
            "<b>Visual:</b> a caixa “Sem CTE” no tamanho certo e o selo da etapa preenchido com a cor da coluna.",
        ],
    ], []),
    ("Planilha Google (só consulta)", [
        "Para quem prefere consultar em planilha, há uma planilha Google ligada ao Protheus que se atualiza sozinha a cada "
        "<b>15 minutos</b>, com as abas Pedidos, Itens, Envios, Custos de frete e Resumo e as mesmas regras da tela. "
        "Ela é só para consulta: o registro continua sendo feito na tela.",
    ], []),
]

ONDE = [
    ("Envios do pedido (tabela nova)", "Uma linha por NF a partir da segunda, com as datas, o tipo de material, o indicador e a transportadora "
     "de cada envio. O 1º envio continua no próprio pedido de venda."),
    ("Custos de frete", "Cada cobrança agora guarda a NF do envio a que se refere."),
    ("Histórico da logística", "Também guarda a observação do retorno, a finalização sem entrega (motivo e reembolso) e a descrição do "
     "indicador “Outros”, sem criar mais campos no pedido. Toda alteração, inclusive nos envios, fica com o usuário, a data e a hora."),
    ("Pedido de venda", "O tipo do frete, o endereço de entrega e a mensagem para a nota já existiam no Protheus: a tela só passou a mostrá-los."),
]

P = 'style="margin: 0 0 10px 0; font-size: 14px; line-height: 21px; color: #23262d;"'


def lista_html(itens):
    linhas = "".join(
        f'<tr><td valign="top" style="padding: 3px 8px 3px 0; color: #f0a500; font-weight: bold;">•</td>'
        f'<td style="padding: 3px 0; font-size: 14px; line-height: 21px; color: #23262d;">{i}</td></tr>'
        for i in itens
    )
    return f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 10px 0;">{linhas}</table>'


def bloco(par):
    return lista_html(par) if isinstance(par, list) else f"<p {P}>{par}</p>"


def numero(n, titulo):
    return f"""<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 10px 0;"><tr>
<td style="background: #f0a500; color: #ffffff; font-size: 13px; font-weight: bold; width: 26px; height: 26px; text-align: center; border-radius: 13px;">{n}</td>
<td style="padding-left: 10px; font-size: 17px; font-weight: bold; color: #1f2430;">{titulo}</td></tr></table>"""


def img(src, alt, larg):
    return (
        f'<img src="{src}" width="{larg}" alt="{html.escape(alt)}" style="display: block; border: 1px solid #dfe2e7; '
        f'border-radius: 6px; width: 100%; max-width: {larg}px; height: auto; margin: 0 0 4px 0;" />'
    )


def tabela2(cab, linhas, larg1=190):
    corpo = "".join(
        f'<tr><td valign="top" style="padding: 9px 12px; border-top: 1px solid #eceef1; font-weight: bold; width: {larg1}px;">{a}</td>'
        f'<td valign="top" style="padding: 9px 12px; border-top: 1px solid #eceef1;">{b}</td></tr>'
        for a, b in linhas
    )
    return f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 12px 0; border: 1px solid #dfe2e7; border-radius: 8px; font-size: 13px; line-height: 20px; color: #23262d;">
<tr style="background: #f4f5f7"><td style="padding: 8px 12px; font-size: 12px; font-weight: bold; color: #5f6673;">{cab[0]}</td><td style="padding: 8px 12px; font-size: 12px; font-weight: bold; color: #5f6673;">{cab[1]}</td></tr>
{corpo}</table>"""


def linha(conteudo, topo="22px"):
    return f'<tr><td style="padding: {topo} 32px 0 32px">{conteudo}</td></tr>'


corpo = []
corpo.append(linha(numero(1, "Resumo do que mudou") + tabela2(("O quê", "Para que serve"), RESUMO, 170)))
corpo.append(linha(numero(2, "Na tela"), "26px"))
for tit, pars, imgs in SECOES:
    t = f'<p style="margin: 0 0 4px 0; font-size: 15px; font-weight: bold; color: #1f2430;">{tit}</p>' if tit else ""
    corpo.append(linha(t + "".join(bloco(p) for p in pars) + "".join(img(*i) for i in imgs), "14px" if tit else "4px"))
corpo.append(linha(
    numero(3, "No Protheus")
    + bloco("Como na primeira versão, nada fica fora do Protheus. Para os envios parciais entrou uma tabela nova; o resto usa o que já existia:")
    + tabela2(("Onde fica", "O que mudou"), ONDE, 190),
    "26px"))


def documento(fonte_img):
    intro = "".join(f'<p style="margin: 0 0 10px 0; font-size: 14px; line-height: 22px; color: #23262d;">{p}</p>' for p in INTRO)
    doc = f"""<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Logística no Protheus: atualizações</title>
  </head>
  <body style="margin: 0; padding: 0; background: #f4f5f7; font-family: &quot;Segoe UI&quot;, Arial, Helvetica, sans-serif; color: #1f2430;">
    <!-- Copiar daqui: abrir no navegador, Ctrl+A, Ctrl+C e colar no corpo do e-mail -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f4f5f7">
      <tr><td align="center" style="padding: 24px 12px">
        <table role="presentation" width="900" cellpadding="0" cellspacing="0" border="0" style="width: 900px; max-width: 100%; background: #ffffff; border: 1px solid #dfe2e7; border-radius: 10px; overflow: hidden;">
          <tr><td style="padding: 24px 32px 18px 32px; border-bottom: 4px solid #f0a500;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td valign="middle"><img src="vs_logo.png" width="170" alt="Videosoft Autoatendimento" style="display: block; border: 0; width: 170px; height: auto;" /></td>
              <td valign="middle" align="right"><img src="totvs_logo.png" width="120" alt="TOTVS Protheus" style="display: block; border: 0; width: 120px; height: auto;" /></td>
            </tr></table>
          </td></tr>
          <tr><td style="padding: 28px 32px 0 32px">
            <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: bold; color: #9a6a00; text-transform: uppercase; letter-spacing: 0.5px;">Logística · Pedidos de entrega · atualizações de 25/11/2026</p>
            <h1 style="margin: 0 0 12px 0; font-size: 22px; line-height: 28px; color: #1f2430;">{TITULO}</h1>
            <p style="margin: 0 0 10px 0; font-size: 14px; line-height: 22px; color: #23262d;">Olá!</p>
            {intro}
          </td></tr>
          {"".join(corpo)}
          <tr><td style="padding: 24px 32px 28px 32px">
            <p style="margin: 0 0 10px 0; font-size: 14px; line-height: 22px; color: #23262d;">Qualquer dúvida ou ajuste, é só me chamar.</p>
            <p style="margin: 0; font-size: 14px; line-height: 22px; color: #23262d;">Fico à disposição.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
    <!-- ate aqui -->
  </body>
</html>
"""
    return re.sub(r'src="([\w.-]+\.png)"', lambda m: f'src="{fonte_img(m.group(1))}"', doc)


io.open(os.path.join(D, "email.html"), "w", encoding="utf-8", newline="\n").write(documento(lambda n: n))
io.open(os.path.join(D, "email-gmail.html"), "w", encoding="utf-8", newline="\n").write(
    documento(lambda n: "data:image/png;base64," + base64.b64encode(open(os.path.join(D, n), "rb").read()).decode()).replace(
        "<!-- Copiar daqui: abrir no navegador, Ctrl+A, Ctrl+C e colar no corpo do e-mail -->",
        "<!-- Versao para o Gmail: imagens dentro do arquivo. Abrir no Chrome, Ctrl+A, Ctrl+C e colar no corpo do e-mail -->"))


def txt(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s.replace("<br>", "\n")))


out = [f"Assunto: {TITULO}", "", "Olá!", ""] + [txt(p) + "\n" for p in INTRO]
out += ["", "1. RESUMO DO QUE MUDOU", ""] + [f"- {a}: {txt(b)}" for a, b in RESUMO]
out += ["", "", "2. NA TELA", ""]
for tit, pars, imgs in SECOES:
    if tit:
        out.append(tit.upper())
    for p in pars:
        out += [f"- {txt(i)}" for i in p] if isinstance(p, list) else [txt(p)]
    out += ([f"[imagem: {', '.join(i[0] for i in imgs)}]"] if imgs else []) + [""]
out += ["", "3. NO PROTHEUS", "",
        "Como na primeira versão, nada fica fora do Protheus. Para os envios parciais entrou uma tabela nova; o resto usa o que já existia:", ""]
out += [f"- {a}: {txt(b)}" for a, b in ONDE]
out += ["", "", "Qualquer dúvida ou ajuste, é só me chamar.", "", "Fico à disposição.", ""]
io.open(os.path.join(D, "email.txt"), "w", encoding="utf-8", newline="\n").write("\n".join(out))
print("ok")
