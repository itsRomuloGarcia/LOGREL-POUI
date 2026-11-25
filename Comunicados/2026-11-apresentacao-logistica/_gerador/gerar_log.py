# Comunicado de apresentacao da tela de Logistica: email.html, email.txt e email-gmail.html
import sys, io, html, os, re, base64

D = sys.argv[1]

TITULO = "Logística no Protheus: os envios saem da planilha"
INTRO = [
    "Como foi feito na <b>RX Pedidos</b>, avançamos para a logística para “exterminar” a dependência de planilhas e ter "
    "uma única base de dados e de consulta: o <b>Protheus</b>.",
    "A tela <b>Logística · Pedidos de entrega</b>, aberta pelo menu do Protheus, passa a ser o lugar onde cada envio é "
    "acompanhado e registrado: da programação da saída até a entrega, com os custos de frete e o histórico de tudo o que foi "
    "alterado. Os envios que estavam na planilha ENVIOS 2026 <b>já estão no Protheus</b>, com rastreio de onde veio cada dado.",
    "Abaixo, como foi feito, o que a tela faz e os próximos passos. <i>Os prints usam dados fictícios.</i>",
]

RESUMO = [
    ("Uma base só", "Tudo fica no pedido de venda do Protheus e em duas tabelas novas. A planilha ENVIOS 2026 já foi importada."),
    ("Quadros", "Em que etapa está cada pedido (previsto, faturado, enviado, entregue, retornado) e os alertas do dia."),
    ("Programação", "As saídas de hoje e dos próximos dias, o botão <b>Saiu</b>, o DANFE e as entregas previstas para hoje."),
    ("Detalhe do pedido", "Envio, entrega, reentrega, retorno, dados para a NF-e, telefone do cliente, itens e números de série."),
    ("Custos de frete", "O CTE do envio, cada reentrega e as taxas extras, com a situação: OK, divergente, em contato, ajustado."),
    ("Histórico", "Quem alterou o quê e quando, no pedido e em cada cobrança."),
    ("Lista, XLSX e indicadores", "Consulta completa, planilha sob demanda e os números de prazo, transportadoras e frete."),
    ("API", "Os mesmos dados podem ser lidos por outras ferramentas, como o CRM dos vendedores."),
]

ONDE = [
    ("Pedido de venda (SC5)", "Campos novos na pasta da logística: data de envio, previsão de entrega da transportadora, data de entrega, "
     "tipo de material, gerou reentrega e nova data, indicador de atraso, observações da entrega e retorno (data, motivo e pedido do reenvio). "
     "Também espécie, pesos e volume, que precisam estar no pedido antes da NF-e."),
    ("Custos de frete (tabela nova)", "Uma linha por cobrança: o CTE do envio, cada reentrega, armazenagem, devolução e outras taxas, "
     "com o número do documento, a data, a transportadora, o valor, a situação, o valor esperado e uma observação."),
    ("Histórico da logística (tabela nova)", "Cada alteração feita pela tela, no pedido ou numa cobrança: o campo, o valor antes, o valor "
     "depois, o usuário, a data e a hora. Inclusões e exclusões de cobrança também ficam registradas."),
    ("O que o Protheus já tinha", "Cliente, cidade e UF de entrega, telefone do cadastro, vendedor, transportadora, notas fiscais, itens, "
     "números de série e frete cobrado: a tela só lê, ninguém digita de novo."),
]

# (titulo, [paragrafos/listas], [(imagem, alt, largura)])
SECOES = [
    ("Quadros", [
        "Os pedidos em cinco colunas: <b>previstos</b> (todos os sem NF), <b>faturados</b> aguardando a saída, <b>enviados</b>, "
        "<b>entregues</b> e <b>retornados</b>. Cada coluna tem a sua ordem (mais antigos ou mais novos primeiro).",
        "No topo, os alertas: em trânsito atrasados, vencem em até 2 dias, faturados parados, sem previsão da transportadora, "
        "sem dados para a NF-e, aguardando reenvio e <b>custo de frete em divergência</b>. A busca acha o pedido pelo número, cliente, "
        "cidade, NF, CTE, número de série ou telefone.",
    ], [("01-quadros.png", "Aba Quadros", 836)]),
    ("Programação", [
        "As saídas por dia, pela data de saída programada do pedido: <b>não saíram</b>, <b>hoje</b>, os próximos dias úteis e "
        "<b>sem programação</b>. Para reprogramar, basta arrastar o cartão para outro dia. O botão <b>Saiu</b> grava a data de envio de "
        "hoje, e o <b>DANFE</b> imprime a nota direto do cartão.",
    ], [("02-programacao.png", "Aba Programação", 836)]),
    (None, [
        "Mais abaixo, as <b>entregas previstas para hoje</b>: os pedidos em trânsito com a previsão da transportadora para hoje. "
        "O botão <b>Entregue</b> grava a data de entrega de hoje (a nova data, quando houve reentrega) e o pedido passa para Entregues.",
    ], [("02b-entregas-hoje.png", "Entregas previstas para hoje, com o botão Entregue", 580)]),
    ("Detalhe do pedido", [
        "Um clique no pedido abre o detalhe. No topo, cada nota fiscal com o botão <b>Imprimir DANFE</b>. Depois, o formulário: "
        "dados para a NF-e (antes da nota), <b>envio e entrega</b>, custos de frete, reentrega e retorno. Salvar grava só o que mudou.",
    ], [("03a-detalhe.png", "Detalhe do pedido: NF, dados do pedido e envio e entrega", 680)]),
    ("Custos de frete", [
        "Logo abaixo de “Envio e entrega”, a lista das cobranças do pedido com o total. Um pedido pode ter várias: o CTE do envio, "
        "cada reentrega, armazenagem, devolução ou outra taxa.",
        "Quando o CTE chega com valor diferente do combinado, a cobrança é marcada como <b>Divergente</b>, com o valor esperado e uma "
        "observação do contato com a transportadora. Depois vira <b>Em contato</b>, <b>Ajustado</b> ou <b>Aceito como veio</b>. "
        "O alerta dos Quadros e o filtro “Custo de frete em divergência” mostram tudo o que ainda está em aberto.",
    ], [("03b-custos.png", "Custos de frete do pedido", 680)]),
    (None, [
        "<b>+ Adicionar cobrança</b> e <b>Editar</b> abrem o formulário ali mesmo e gravam na hora, sem fechar o pedido. "
        "A exclusão pede confirmação e fica registrada no histórico.",
    ], [("03c-custo-editar.png", "Editando uma cobrança", 680)]),
    ("Histórico de alterações", [
        "No fim do detalhe, o histórico do pedido: cada campo alterado, de quanto para quanto, por quem e quando. "
        "O que veio da planilha aparece como <b>Importação</b>, e os CTEs copiados para a tabela nova, como <b>Carga inicial</b>.",
    ], [("03d-historico.png", "Histórico de alterações do pedido", 680)]),
    ("Cliente, frete e itens", [
        "O frete cobrado no pedido contra o custo das cobranças, os dados do cliente com o <b>telefone do cadastro</b> (com link para "
        "discar) e os itens com os <b>números de série</b>.",
    ], [("03e-cliente-itens.png", "Frete, cliente com telefone e itens", 680)]),
    ("Lista completa e Exportar XLSX", [
        "A <b>Lista completa</b> traz um item por linha, com todas as colunas e ordenação.",
    ], [("04-lista.png", "Lista completa", 836)]),
    (None, [
        "O botão <b>Exportar XLSX</b> gera a planilha na hora, escolhendo o que sai: todos, previstos, faturados, enviados, entregues, "
        "atrasados, retornados ou com custo em divergência, com ou sem os filtros da tela. As abas são <b>Pedidos</b>, <b>Itens</b> e "
        "<b>Custos de frete</b>, em formato de tabela do Excel. A planilha passa a ser só uma saída: a base é o Protheus.",
    ], [("05-exportar-xlsx.png", "Janela do Exportar XLSX", 520)]),
    ("Indicadores", [
        "Entregas no prazo e atrasadas por mês (pela previsão da transportadora), motivos dos atrasos, comparação e ranking das "
        "transportadoras (% no prazo, atraso médio, tempo de entrega, custo médio, % reentrega, % com custo em divergência) e o "
        "frete acumulado por transportadora.",
    ], [("06-indicadores.png", "Indicadores", 836)]),
    (None, [
        "E o <b>custo de frete × frete cobrado</b> por mês, com os pedidos em que o custo passou do cobrado do cliente. O custo soma "
        "todas as cobranças: CTE, reentregas e taxas.",
    ], [("07-custo-x-cobrado.png", "Custo de frete × frete cobrado", 836)]),
]

BOM_SABER = [
    "Pedidos de <b>remessa por conta e ordem</b> não aparecem na tela: o transporte vai no pedido da venda.",
    "Pedido que saiu em <b>mais de uma entrega</b> fica com um envio no pedido; os CTEs das outras saídas entram como cobranças em Custos de frete.",
    "A <b>importação de planilha</b> continua disponível na tela, para uma carga pontual, mas o registro do dia a dia é feito direto no pedido.",
]

API = [
    "Como tudo está no Protheus e é servido por uma API, outras ferramentas podem ler os mesmos dados, sem planilha e sem digitar de novo.",
    "Um exemplo é o <b>CRM</b>: dentro do cliente, o vendedor consulta onde está cada pedido, se já saiu, a transportadora, a nota, o CTE, "
    "a previsão e a data de entrega. Ele acompanha a entrega sem precisar perguntar à logística, e todo mundo olha para o mesmo dado.",
]
PROXIMO = [
    "O próximo passo é integrar as <b>APIs das transportadoras</b>:",
    [
        "<b>Rastreio:</b> a situação da entrega e a data de entrega vêm da transportadora, sem digitação, e o atraso aparece na hora;",
        "<b>Cotação:</b> o frete é cotado antes da saída e o valor combinado fica gravado. Ele vira o valor esperado na conferência do CTE, "
        "e a divergência passa a ser apontada automaticamente.",
    ],
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


def destaque(titulo, texto):
    return f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 2px 0 12px 0; background: #fff8e6; border-left: 4px solid #f0a500; border-radius: 6px;">
<tr><td style="padding: 12px 14px; font-size: 14px; line-height: 21px; color: #23262d;"><b>{titulo}</b><br>{texto}</td></tr></table>"""


def linha(conteudo, topo="22px"):
    return f'<tr><td style="padding: {topo} 32px 0 32px">{conteudo}</td></tr>'


corpo = []
corpo.append(linha(numero(1, "Resumo") + tabela2(("O quê", "Para que serve"), RESUMO, 170)))
corpo.append(linha(
    numero(2, "Como foi feito: tudo no Protheus")
    + bloco("Nada fica fora do Protheus. A tela lê e grava direto no pedido de venda e em duas tabelas novas, por uma API própria. "
            "Quem tem a rotina no menu abre a tela, sem outro cadastro e sem outra senha.")
    + tabela2(("Onde fica", "O que guarda"), ONDE, 190)
    + destaque("Os envios da planilha já estão no Protheus",
               "A planilha ENVIOS 2026 foi importada pela própria tela: datas de envio, previsão e entrega, material, CTE e valor, "
               "reentregas e indicadores de atraso, de janeiro até agora. Depois, cada CTE foi copiado para a tabela de custos de frete "
               "e a soma foi conferida: o total dos CTEs no pedido e na tabela nova é o mesmo, centavo a centavo.<br>"
               "No histórico, o que veio da planilha tem a marca <b>Importação</b> e cada CTE copiado, a marca <b>Carga inicial</b>. "
               "Daqui em diante, toda alteração fica registrada com o usuário, a data e a hora.")
    + bloco("A partir de agora, <b>a planilha não precisa mais ser preenchida</b>: o registro é feito na tela, no pedido.")
    + bloco("<b>Bom saber:</b>") + bloco(BOM_SABER),
    "26px"))
corpo.append(linha(numero(3, "A tela, aba por aba"), "26px"))
for tit, pars, imgs in SECOES:
    t = f'<p style="margin: 0 0 4px 0; font-size: 15px; font-weight: bold; color: #1f2430;">{tit}</p>' if tit else ""
    corpo.append(linha(t + "".join(bloco(p) for p in pars) + "".join(img(*i) for i in imgs), "14px" if tit else "4px"))
corpo.append(linha(numero(4, "Os dados também saem do Protheus, por API") + "".join(bloco(p) for p in API), "26px"))
corpo.append(linha(numero(5, "Próximo passo: APIs das transportadoras") + "".join(bloco(p) for p in PROXIMO), "26px"))


def documento(fonte_img):
    intro = "".join(f'<p style="margin: 0 0 10px 0; font-size: 14px; line-height: 22px; color: #23262d;">{p}</p>' for p in INTRO)
    doc = f"""<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Logística no Protheus</title>
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
            <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: bold; color: #9a6a00; text-transform: uppercase; letter-spacing: 0.5px;">Logística · Pedidos de entrega · apresentação</p>
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
out += ["", "1. RESUMO", ""] + [f"- {a}: {txt(b)}" for a, b in RESUMO]
out += ["", "", "2. COMO FOI FEITO: TUDO NO PROTHEUS", "",
        "Nada fica fora do Protheus. A tela lê e grava direto no pedido de venda e em duas tabelas novas, por uma API própria. Quem tem a rotina no menu abre a tela, sem outro cadastro e sem outra senha.", ""]
out += [f"- {a}: {txt(b)}" for a, b in ONDE]
out += ["", "OS ENVIOS DA PLANILHA JÁ ESTÃO NO PROTHEUS",
        txt("A planilha ENVIOS 2026 foi importada pela própria tela: datas de envio, previsão e entrega, material, CTE e valor, reentregas e indicadores de atraso, de janeiro até agora. Depois, cada CTE foi copiado para a tabela de custos de frete e a soma foi conferida: o total dos CTEs no pedido e na tabela nova é o mesmo, centavo a centavo."),
        txt("No histórico, o que veio da planilha tem a marca Importação e cada CTE copiado, a marca Carga inicial. Daqui em diante, toda alteração fica registrada com o usuário, a data e a hora."),
        "", "A partir de agora, a planilha não precisa mais ser preenchida: o registro é feito na tela, no pedido.", "", "Bom saber:"]
out += [f"- {txt(b)}" for b in BOM_SABER]
out += ["", "", "3. A TELA, ABA POR ABA", ""]
for tit, pars, imgs in SECOES:
    if tit:
        out.append(tit)
    for p in pars:
        out += [f"- {txt(i)}" for i in p] if isinstance(p, list) else [txt(p)]
    out += [f"[imagem: {', '.join(i[0] for i in imgs)}]", ""]
out += ["", "4. OS DADOS TAMBÉM SAEM DO PROTHEUS, POR API", ""] + [txt(p) + "\n" for p in API]
out += ["", "5. PRÓXIMO PASSO: APIS DAS TRANSPORTADORAS", "", txt(PROXIMO[0])] + [f"- {txt(i)}" for i in PROXIMO[1]]
out += ["", "", "Qualquer dúvida ou ajuste, é só me chamar.", "", "Fico à disposição.", ""]
io.open(os.path.join(D, "email.txt"), "w", encoding="utf-8", newline="\n").write("\n".join(out))
print("ok")
