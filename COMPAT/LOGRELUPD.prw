#include "totvs.ch"

#define UP_TAB    "SC5"
#define UP_PREF   "C5_Z"
#define UP_PASTA  "\logrelupd\"
#define UP_TIT    "LOGRELUPD"
#define TB_ZLC    "ZLC"
#define TB_ZLH    "ZLH"
#define NM_ZLC    "CUSTOS DE FRETE DO PEDIDO"
#define NM_ZLH    "HISTORICO DA LOGISTICA"

/*/{Protheus.doc} LOGRELUPD
Compatibilizador dos campos C5_Z* da tela de logistica (LOGREL).
Os campos foram criados a mao na homologacao, entao a definicao e COPIADA de
la, registro por registro do SX3 (e gatilhos do SX7), em vez de redigitada:

1) Exportar (na HOMOLOGACAO): le do SX3 todos os campos da SC5 que comecam com
   C5_Z, com todas as colunas do registro (X3_USADO, X3_RESERV e X3_OBRIGAT
   vao como estao, codificados), e os gatilhos SX7 desses campos. Grava um
   arquivo JSON no servidor (\logrelupd\) e copia para uma pasta local.
2) Importar (na PRODUCAO): le esse arquivo, mostra a previa (criar / ja
   existe / ja existe com outra definicao) e, confirmado, cria so os campos
   que faltam (X3_ORDEM no fim da SC5), os gatilhos que faltam e roda o
   X31UpdTable("SC5") para criar as colunas no banco.

So cria os campos da logistica (lista Esperados, os que a RESTLOGREL usa) e
os gatilhos deles: os outros C5_Z* do arquivo (faturamento, financeiro...)
so aparecem na previa. Campo que ja existe na producao NUNCA e alterado.
Pode rodar de novo: so cria o que falta.
3) Tabelas (19/11/2026, homologacao e depois producao): cria ou completa a ZLC
   (custos de frete do pedido: CTE, reentregas e taxas, uma linha por
   cobranca) e a ZLH (historico das alteracoes feitas pela tela), com campos
   fixos neste fonte (caminho do VSHISTUPD). Em seguida oferece a carga
   inicial: o CTE e o CTE da reentrega da SC5 viram cobrancas de Envio e
   Reentrega na ZLC, com a conferencia das somas. Tabela nova no dicionario
   pede sair e entrar no Protheus e rodar a opcao de novo para a carga.
Texto do arquivo vai em Base64 (Encode64) para nao estragar os campos
codificados do SX3 na troca de codificacao.
Rodar pelo menu, com a empresa aberta, FORA DO EXPEDIENTE (o X31UpdTable
altera a SC5 no banco). Depois, todos saem e entram de novo no Protheus.
Fonte so ASCII.
@type function
@author Romulo Garcia
@since 18/11/2026
/*/
User Function LOGRELUPD()
   Local nOpc := 0

   If Type("cEmpAnt") != "C" .or. Empty(cEmpAnt)
      MsgStop("Rode pelo menu do Protheus, com a empresa aberta.", UP_TIT)
      Return
   EndIf
   nOpc := Aviso(UP_TIT + " - campos C5_Z da logistica", ;
      "Ambiente: " + GetEnvServer() + "  /  empresa " + cEmpAnt + CRLF + CRLF + ;
      "EXPORTAR (rodar na HOMOLOGACAO): le os campos C5_Z* do SX3 e os gatilhos " + ;
      "do SX7 e gera um arquivo .json." + CRLF + CRLF + ;
      "IMPORTAR (rodar na PRODUCAO): le esse arquivo, mostra o que vai ser criado " + ;
      "e, confirmado, cria so os campos que faltam e altera a SC5 no banco. " + ;
      "Fora do expediente." + CRLF + CRLF + ;
      "TABELAS: cria ou completa a " + TB_ZLC + " (custos de frete) e a " + TB_ZLH + ;
      " (historico da logistica) e copia os CTEs da SC5 para a " + TB_ZLC + ".", ;
      {"Exportar", "Importar", "Tabelas", "Cancelar"}, 3)
   If nOpc == 1
      Exporta()
   ElseIf nOpc == 2
      Importa()
   ElseIf nOpc == 3
      Tabelas()
   EndIf
Return

// Campos que a API RESTLOGREL usa (para avisar se algum nao veio). A observacao
// do retorno NAO e campo da SC5: fica na ZLH (ZLH_OBS, criado pelo usuario).
Static Function Esperados()
Return {"C5_ZCTE", "C5_ZCTEREE", "C5_ZDTENTR", "C5_ZDTENV", "C5_ZDTPREV", ;
   "C5_ZDTRET", "C5_ZFRETE", "C5_ZINDICA", "C5_ZMOTRET", "C5_ZNDENT", ;
   "C5_ZOBS", "C5_ZPEDREN", "C5_ZREENTR", "C5_ZTPMAT", "C5_ZTPPEDI", ;
   "C5_ZVCTERE", "C5_ZVLRCTE"}

// ---------------------------------------------------------------- exportar
Static Function Exporta()
   Local oJ     := JsonObject():New()
   Local aCpo   := {}
   Local aGat   := {}
   Local aNomes := {}
   Local aEsp   := Esperados()
   Local cLista := ""
   Local cFalta := ""
   Local cArq   := ""
   Local cLocal := ""
   Local cOnde  := ""
   Local nI     := 0

   DbSelectArea("SX3")
   SX3->(DbSetOrder(1)) // X3_ARQUIVO+X3_ORDEM
   SX3->(DbSeek(UP_TAB))
   While !SX3->(Eof()) .and. SX3->X3_ARQUIVO == UP_TAB
      If Left(SX3->X3_CAMPO, Len(UP_PREF)) == UP_PREF
         aAdd(aCpo, RegJson("SX3"))
         aAdd(aNomes, AllTrim(SX3->X3_CAMPO))
         cLista += DescCampo() + CRLF
         If SX3->X3_TRIGGER == "S"
            Gatilhos(SX3->X3_CAMPO, aGat)
         EndIf
      EndIf
      SX3->(DbSkip())
   EndDo

   If Empty(aCpo)
      MsgStop("Nenhum campo " + UP_PREF + "* encontrado no SX3 da " + UP_TAB + ". Nada exportado.", UP_TIT)
      Return
   EndIf
   For nI := 1 to Len(aEsp)
      If aScan(aNomes, aEsp[nI]) == 0
         cFalta += aEsp[nI] + " "
      EndIf
   Next nI

   oJ["tabela"]  := UP_TAB
   oJ["origem"]  := GetEnvServer()
   oJ["empresa"] := cEmpAnt
   oJ["data"]    := DTOS(Date()) + " " + Time()
   oJ["campos"]  := aNomes
   oJ["sx3"]     := aCpo
   oJ["sx7"]     := aGat

   MakeDir(UP_PASTA)
   cArq := UP_PASTA + "LOGRELUPD_" + cEmpAnt + "_" + DTOS(Date()) + ".json"
   If !MemoWrite(cArq, oJ:toJson())
      MsgStop("Nao foi possivel gravar " + cArq + " no servidor.", UP_TIT)
      Return
   EndIf
   cOnde := "Servidor: " + cArq
   cLocal := cGetFile("", "Pasta do seu computador para salvar o arquivo", 0, "C:\", .F., ;
      GETF_LOCALHARD + GETF_RETDIRECTORY, .F.)
   If !Empty(cLocal)
      If CpyS2T(cArq, cLocal, .F.)
         cOnde += CRLF + "Seu computador: " + cLocal
      Else
         cOnde += CRLF + "NAO foi possivel copiar para " + cLocal + "."
      EndIf
   EndIf

   Aviso(UP_TIT + " - exportado", ;
      cValToChar(Len(aCpo)) + " campo(s) e " + cValToChar(Len(aGat)) + " gatilho(s) exportado(s)." + CRLF + ;
      cOnde + CRLF + CRLF + ;
      IIf(Empty(cFalta), "", "ATENCAO, a API usa e nao estao no SX3 daqui: " + cFalta + CRLF + CRLF) + ;
      cLista, {"Ok"}, 3)
Return

Static Function Gatilhos(cCampo, aGat)
   DbSelectArea("SX7")
   SX7->(DbSetOrder(1)) // X7_CAMPO+X7_SEQUENC
   SX7->(DbSeek(cCampo))
   While !SX7->(Eof()) .and. SX7->X7_CAMPO == cCampo
      aAdd(aGat, RegJson("SX7"))
      SX7->(DbSkip())
   EndDo
Return

// Linha legivel de um campo do SX3 posicionado
Static Function DescCampo()
Return AllTrim(SX3->X3_CAMPO) + " " + SX3->X3_TIPO + " " + cValToChar(SX3->X3_TAMANHO) + ;
   IIf(SX3->X3_DECIMAL > 0, "," + cValToChar(SX3->X3_DECIMAL), "") + ;
   " - " + AllTrim(SX3->X3_TITULO) + ;
   IIf(Empty(SX3->X3_CBOX), "", " [" + AllTrim(SX3->X3_CBOX) + "]")

// Registro posicionado -> JSON. Cada coluna vira {"t": tipo, "v": valor};
// texto em Base64, data em AAAAMMDD.
Static Function RegJson(cAlias)
   Local oR := JsonObject():New()
   Local oV := Nil
   Local xV := Nil
   Local nI := 0
   For nI := 1 to (cAlias)->(FCount())
      xV := (cAlias)->(FieldGet(nI))
      oV := JsonObject():New()
      oV["t"] := ValType(xV)
      Do Case
      Case ValType(xV) $ "CM"
         oV["v"] := Encode64(xV)
      Case ValType(xV) == "D"
         oV["v"] := DTOS(xV)
      Otherwise
         oV["v"] := xV
      EndCase
      oR[AllTrim((cAlias)->(FieldName(nI)))] := oV
   Next nI
Return oR

// ---------------------------------------------------------------- importar
Static Function Importa()
   Local oJ     := JsonObject():New()
   Local cLocal := ""
   Local cNome  := ""
   Local cArq   := ""
   Local cTxt   := ""
   Local xErr   := Nil
   Local aCpo   := {}
   Local aGat   := {}
   Local aNovos := {}
   Local aGNov  := {}
   Local aEsp   := Esperados()
   Local aNomes := {}
   Local cPrev  := ""
   Local cDif   := ""
   Local cJa    := ""
   Local cFalta := ""
   Local cFora  := ""
   Local aCriar := {}
   Local cCampo := ""
   Local cLog   := ""
   Local nI     := 0

   cLocal := cGetFile("Arquivo do LOGRELUPD (*.json)|*.json", "Arquivo exportado da homologacao", 1, "C:\", .F., ;
      GETF_LOCALHARD, .F.)
   If Empty(cLocal)
      Return
   EndIf
   cNome := SubStr(cLocal, Max(RAt("\", cLocal), RAt("/", cLocal)) + 1)
   MakeDir(UP_PASTA)
   If !CpyT2S(cLocal, UP_PASTA, .F.)
      MsgStop("Nao foi possivel copiar " + cLocal + " para o servidor.", UP_TIT)
      Return
   EndIf
   cArq := UP_PASTA + cNome
   cTxt := LerArq(cArq)
   If Empty(cTxt)
      MsgStop("Arquivo vazio ou nao encontrado no servidor: " + cArq, UP_TIT)
      Return
   EndIf
   xErr := oJ:FromJson(cTxt)
   If ValType(xErr) == "C"
      MsgStop("Arquivo invalido (JSON): " + xErr, UP_TIT)
      Return
   EndIf
   If ValType(oJ["tabela"]) != "C" .or. oJ["tabela"] != UP_TAB .or. ValType(oJ["sx3"]) != "A"
      MsgStop("Este arquivo nao e uma exportacao do " + UP_TIT + ".", UP_TIT)
      Return
   EndIf
   aCpo := oJ["sx3"]
   aGat := IIf(ValType(oJ["sx7"]) == "A", oJ["sx7"], {})

   // ----- previa dos campos
   DbSelectArea("SX3")
   SX3->(DbSetOrder(2)) // X3_CAMPO
   For nI := 1 to Len(aCpo)
      cCampo := AllTrim(Valor(aCpo[nI], "X3_CAMPO"))
      aAdd(aNomes, cCampo)
      If AllTrim(Valor(aCpo[nI], "X3_ARQUIVO")) != UP_TAB .or. Left(cCampo, Len(UP_PREF)) != UP_PREF
         MsgStop("Campo inesperado no arquivo: " + cCampo + ". Nada foi alterado.", UP_TIT)
         Return
      EndIf
      If aScan(aEsp, cCampo) == 0
         // C5_Z* de outras rotinas (faturamento, financeiro...): nunca cria
         If !SX3->(DbSeek(PadR(cCampo, Len(SX3->X3_CAMPO))))
            cFora += cCampo + " "
         EndIf
         Loop
      EndIf
      If SX3->(DbSeek(PadR(cCampo, Len(SX3->X3_CAMPO))))
         If SX3->X3_TIPO != Valor(aCpo[nI], "X3_TIPO") .or. ;
               SX3->X3_TAMANHO != Valor(aCpo[nI], "X3_TAMANHO") .or. ;
               SX3->X3_DECIMAL != Valor(aCpo[nI], "X3_DECIMAL")
            cDif += "  " + cCampo + ": aqui " + SX3->X3_TIPO + " " + cValToChar(SX3->X3_TAMANHO) + ;
               "," + cValToChar(SX3->X3_DECIMAL) + " / no arquivo " + Valor(aCpo[nI], "X3_TIPO") + " " + ;
               cValToChar(Valor(aCpo[nI], "X3_TAMANHO")) + "," + cValToChar(Valor(aCpo[nI], "X3_DECIMAL")) + CRLF
         Else
            cJa += cCampo + " "
         EndIf
      Else
         aAdd(aNovos, aCpo[nI])
         aAdd(aCriar, cCampo)
         cPrev += "  " + cCampo + " " + Valor(aCpo[nI], "X3_TIPO") + " " + ;
            cValToChar(Valor(aCpo[nI], "X3_TAMANHO")) + ;
            IIf(Valor(aCpo[nI], "X3_DECIMAL") > 0, "," + cValToChar(Valor(aCpo[nI], "X3_DECIMAL")), "") + ;
            " - " + AllTrim(Valor(aCpo[nI], "X3_TITULO")) + Pasta(Valor(aCpo[nI], "X3_FOLDER")) + CRLF
      EndIf
   Next nI
   For nI := 1 to Len(aEsp)
      If aScan(aNomes, aEsp[nI]) == 0
         cFalta += aEsp[nI] + " "
      EndIf
   Next nI

   // ----- previa dos gatilhos
   DbSelectArea("SX7")
   SX7->(DbSetOrder(1))
   For nI := 1 to Len(aGat)
      // so gatilho de campo da logistica que vai ser criado agora
      If aScan(aCriar, AllTrim(Valor(aGat[nI], "X7_CAMPO"))) == 0
         Loop
      EndIf
      If !SX7->(DbSeek(Valor(aGat[nI], "X7_CAMPO") + Valor(aGat[nI], "X7_SEQUENC")))
         aAdd(aGNov, aGat[nI])
      EndIf
   Next nI

   cPrev := "Ambiente: " + GetEnvServer() + "  /  empresa " + cEmpAnt + CRLF + ;
      "Arquivo: " + cNome + " (de " + cValToChar(oJ["origem"]) + ", " + cValToChar(oJ["data"]) + ")" + CRLF + CRLF + ;
      "CRIAR " + cValToChar(Len(aNovos)) + " campo(s):" + CRLF + IIf(Empty(cPrev), "  nenhum" + CRLF, cPrev) + CRLF + ;
      "Gatilhos (SX7) a criar: " + cValToChar(Len(aGNov)) + CRLF + CRLF + ;
      IIf(Empty(cDif), "", "JA EXISTEM COM OUTRA DEFINICAO (nao serao alterados, conferir a mao):" + CRLF + cDif + CRLF) + ;
      IIf(Empty(cJa), "", "Ja existem iguais (mantidos): " + cJa + CRLF + CRLF) + ;
      IIf(Empty(cFalta), "", "ATENCAO, a API usa e nao vieram no arquivo: " + cFalta + CRLF + CRLF) + ;
      IIf(Empty(cFora), "", "Outros C5_Z* do arquivo que nao existem aqui (NAO sao da logistica, nao serao criados): " + ;
      cFora + CRLF + CRLF)

   If Empty(aNovos) .and. Empty(aGNov)
      Aviso(UP_TIT + " - nada a criar", cPrev, {"Ok"}, 3)
      Return
   EndIf
   If Aviso(UP_TIT + " - previa", cPrev + ;
         "Vai alterar o dicionario e a tabela " + RetSqlName(UP_TAB) + " no banco. Ninguem pode estar " + ;
         "usando pedidos de venda. Continuar?", {"Criar", "Cancelar"}, 3) != 1
      Return
   EndIf
   FWMsgRun(, {|| cLog := Grava(aNovos, aGNov) }, UP_TIT, "Atualizando o dicionario e a SC5...")
   Aviso(UP_TIT + " - resultado", cLog, {"Ok"}, 3)
Return

Static Function Grava(aNovos, aGNov)
   Local cLog    := ""
   Local bErrOld := ErrorBlock({|oE| Break(oE) })
   Local oErr    := Nil
   Local aEst    := {}
   Local aOver   := {}
   Local cOrd    := ""
   Local cCampo  := ""
   Local cPasta  := ""
   Local cF3     := ""
   Local nI      := 0

   Begin Sequence
      // ---------- SX3 ----------
      cOrd := UltOrdem()
      For nI := 1 to Len(aNovos)
         cOrd   := Soma1(cOrd)
         cCampo := AllTrim(Valor(aNovos[nI], "X3_CAMPO"))
         aOver  := {{"X3_ARQUIVO", UP_TAB}, {"X3_ORDEM", cOrd}}
         cPasta := AllTrim(Valor(aNovos[nI], "X3_FOLDER"))
         If !Empty(cPasta)
            DbSelectArea("SXA")
            SXA->(DbSetOrder(1)) // XA_ALIAS+XA_ORDEM
            If !SXA->(DbSeek(UP_TAB + cPasta))
               aAdd(aOver, {"X3_FOLDER", ""})
               cLog += "Aviso: " + cCampo + " estava na pasta " + cPasta + ", que nao existe aqui; ficou sem pasta." + CRLF
            EndIf
         EndIf
         cF3 := AllTrim(Valor(aNovos[nI], "X3_F3"))
         If !Empty(cF3)
            DbSelectArea("SXB")
            SXB->(DbSetOrder(1))
            If !SXB->(DbSeek(cF3))
               cLog += "Aviso: " + cCampo + " usa a consulta F3 " + cF3 + ", que nao existe aqui." + CRLF
            EndIf
         EndIf
         JsonReg("SX3", aNovos[nI], aOver)
         cLog += "SX3: " + cCampo + " criado (ordem " + cOrd + ")." + CRLF
      Next nI

      // ---------- SX7 ----------
      For nI := 1 to Len(aGNov)
         JsonReg("SX7", aGNov[nI], {})
         cLog += "SX7: gatilho " + AllTrim(Valor(aGNov[nI], "X7_CAMPO")) + " seq. " + ;
            Valor(aGNov[nI], "X7_SEQUENC") + " criado." + CRLF
      Next nI

      // ---------- tabela fisica ----------
      If !Empty(aNovos)
         __SetX31Mode(.F.)
         If Select(UP_TAB) > 0
            (UP_TAB)->(DbCloseArea())
         EndIf
         X31UpdTable(UP_TAB)
         If __GetX31Error()
            cLog += CRLF + "ERRO no X31UpdTable: " + __GetX31Trace() + CRLF + ;
               "O dicionario ja foi gravado. Rode de novo fora do expediente (so refaz a tabela)."
            Break
         EndIf
         aEst := TCStruct(RetSqlName(UP_TAB))
         For nI := 1 to Len(aNovos)
            cCampo := AllTrim(Valor(aNovos[nI], "X3_CAMPO"))
            cLog += "Banco " + RetSqlName(UP_TAB) + ": " + cCampo + ;
               IIf(aScan(aEst, {|x| AllTrim(Upper(x[1])) == cCampo }) > 0, " ok.", " NAO ENCONTRADO, conferir.") + CRLF
         Next nI
      EndIf
      cLog += CRLF + "Concluido. Todos devem sair e entrar de novo no Protheus antes de usar a tela."

   Recover Using oErr
      If ValType(oErr) == "O"
         cLog += CRLF + "ERRO: " + AllTrim(oErr:Description) + CRLF + Left(oErr:ErrorStack, 1500)
      EndIf
   End Sequence
   ErrorBlock(bErrOld)
Return cLog

// Pasta (SXA) daqui para a previa: " (pasta 3: Logistica)" ou aviso
Static Function Pasta(cPasta)
   cPasta := AllTrim(cPasta)
   If Empty(cPasta)
      Return ""
   EndIf
   DbSelectArea("SXA")
   SXA->(DbSetOrder(1)) // XA_ALIAS+XA_ORDEM
   If SXA->(DbSeek(UP_TAB + cPasta))
      Return " (pasta " + cPasta + ": " + AllTrim(SXA->XA_DESCRIC) + ")"
   EndIf
Return " (pasta " + cPasta + " NAO existe aqui: fica sem pasta)"

// Maior X3_ORDEM da tabela (0-9 < A-Z, entao a comparacao de texto serve)
Static Function UltOrdem()
   Local cOrd := "00"
   DbSelectArea("SX3")
   SX3->(DbSetOrder(1))
   SX3->(DbSeek(UP_TAB))
   While !SX3->(Eof()) .and. SX3->X3_ARQUIVO == UP_TAB
      If SX3->X3_ORDEM > cOrd
         cOrd := SX3->X3_ORDEM
      EndIf
      SX3->(DbSkip())
   EndDo
Return cOrd

// Novo registro no alias a partir do JSON exportado (coluna que nao existe
// aqui ou com outro tipo e ignorada), com aOver por cima
Static Function JsonReg(cAlias, oR, aOver)
   Local aNom := oR:GetNames()
   Local nI   := 0
   Local nPos := 0
   Local xV   := Nil
   RecLock(cAlias, .T.)
   For nI := 1 to Len(aNom)
      nPos := (cAlias)->(FieldPos(aNom[nI]))
      If nPos == 0
         Loop
      EndIf
      xV := Valor(oR, aNom[nI])
      If ValType(xV) == ValType((cAlias)->(FieldGet(nPos)))
         (cAlias)->(FieldPut(nPos, xV))
      EndIf
   Next nI
   For nI := 1 to Len(aOver)
      nPos := (cAlias)->(FieldPos(aOver[nI][1]))
      If nPos > 0
         (cAlias)->(FieldPut(nPos, aOver[nI][2]))
      EndIf
   Next nI
   (cAlias)->(MsUnlock())
Return

// Valor de uma coluna do registro exportado, ja no tipo original
Static Function Valor(oR, cCol)
   Local oV := oR[cCol]
   Local cT := ""
   Local xV := Nil
   If ValType(oV) != "J"
      Return ""
   EndIf
   cT := oV["t"]
   xV := oV["v"]
   Do Case
   Case cT $ "CM"
      Return IIf(ValType(xV) == "C", Decode64(xV), "")
   Case cT == "D"
      Return STOD(IIf(ValType(xV) == "C", xV, ""))
   Case cT == "N"
      Return IIf(ValType(xV) == "N", xV, 0)
   Case cT == "L"
      Return IIf(ValType(xV) == "L", xV, .F.)
   EndCase
Return xV

Static Function LerArq(cArq)
   Local nH   := FOpen(cArq, 0)
   Local nTam := 0
   Local cBuf := ""
   If nH < 0
      Return ""
   EndIf
   nTam := FSeek(nH, 0, 2)
   FSeek(nH, 0, 0)
   cBuf := Space(nTam)
   FRead(nH, @cBuf, nTam)
   FClose(nH)
Return cBuf

// ================================================================ tabelas
// Opcao "Tabelas" (19/11/2026): cria ou completa a ZLC (custos de frete do
// pedido) e a ZLH (historico da logistica), no mesmo caminho do VSHISTUPD
// (RX Pedidos, ja rodado na homologacao): SX2/SIX copiados da SC2, campos
// copiados de um campo padrao do mesmo tipo (C2_FILIAL, C2_OBS, C6_QTDLIB,
// C2_DATRF) com nome, tamanho, titulo e combo trocados. Pode rodar de novo:
// so cria o que falta. Depois, a carga inicial copia o CTE e o CTE da
// reentrega da SC5 para a ZLC (pedido que ja tem cobranca na ZLC e pulado).
Static Function Tabelas()
   Local cLog  := ""
   Local lNovo := .F.

   If !MsgYesNo("Cria ou completa as tabelas " + TB_ZLC + " (" + NM_ZLC + ") e " + TB_ZLH + " (" + NM_ZLH + ") " + ;
         "na empresa " + cEmpAnt + "." + CRLF + CRLF + ;
         "Mexe no dicionario (SX2, SX3, SIX) e cria as tabelas no banco. Depois oferece a carga " + ;
         "inicial dos CTEs da SC5. Primeiro na homologacao." + CRLF + CRLF + "Continuar?", UP_TIT)
      Return
   EndIf
   FWMsgRun(, {|| cLog := CriaTab(TB_ZLC, NM_ZLC, "FREIGHT COSTS BY ORDER", CamposZLC(), IndicesZLC(), @lNovo) + CRLF + ;
      CriaTab(TB_ZLH, NM_ZLH, "LOGISTICS HISTORY", CamposZLH(), IndicesZLH(), @lNovo) }, UP_TIT, "Atualizando o dicionario...")
   If "PARADO" $ cLog .or. "ERRO" $ cLog
      Aviso(UP_TIT + " - tabelas", cLog, {"Ok"}, 3)
      Return
   EndIf
   If lNovo
      Aviso(UP_TIT + " - tabelas", cLog + CRLF + CRLF + ;
         "Tabela nova no dicionario: saia e entre de novo no Protheus e rode o " + UP_TIT + ;
         ", opcao Tabelas, outra vez para fazer a carga inicial dos CTEs.", {"Ok"}, 3)
      Return
   EndIf
   Aviso(UP_TIT + " - tabelas", cLog, {"Ok"}, 3)
   Carga()
Return

// Campos: {campo, tipo, tamanho, decimal, titulo (12), descricao (25),
// picture, combo, browse, referencia}
Static Function CamposZLC()
   Local aC   := {}
   Local nCte := 20
   DbSelectArea("SX3")
   SX3->(DbSetOrder(2))
   If SX3->(DbSeek(PadR("C5_ZCTE", Len(SX3->X3_CAMPO))))
      nCte := Max(SX3->X3_TAMANHO, 20)
   EndIf
   aAdd(aC, {"ZLC_FILIAL", "C", 0, 0, "Filial", "Filial do sistema", "", "", "N", "C2_FILIAL"})
   aAdd(aC, {"ZLC_PEDIDO", "C", TamSX3("C5_NUM")[1], 0, "Pedido", "Pedido de venda", "@!", "", "S", "C2_OBS"})
   aAdd(aC, {"ZLC_ITEM", "C", 3, 0, "Item", "Item da cobranca", "@!", "", "S", "C2_OBS"})
   aAdd(aC, {"ZLC_TIPO", "C", 1, 0, "Tipo", "Tipo da cobranca", "@!", ;
      "E=Envio;R=Reentrega;A=Armazenagem;D=Devolucao;O=Outra taxa", "S", "C2_OBS"})
   aAdd(aC, {"ZLC_CTE", "C", nCte, 0, "CTE/Doc.", "Numero do CTE ou documento", "@!", "", "S", "C2_OBS"})
   aAdd(aC, {"ZLC_DATA", "D", 8, 0, "Data", "Data do CTE/cobranca", "", "", "S", "C2_DATRF"})
   aAdd(aC, {"ZLC_TRANSP", "C", TamSX3("A4_COD")[1], 0, "Transp.", "Transportadora", "@!", "", "S", "C2_OBS"})
   aAdd(aC, {"ZLC_VALOR", "N", 12, 2, "Valor", "Valor cobrado", "@E 999,999,999.99", "", "S", "C6_QTDLIB"})
   aAdd(aC, {"ZLC_SITUA", "C", 1, 0, "Situacao", "Situacao (vazio = ok)", "@!", ;
      "D=Divergente;C=Em contato;A=Ajustado;I=Aceito como veio", "S", "C2_OBS"})
   aAdd(aC, {"ZLC_VLRESP", "N", 12, 2, "Vlr Esperado", "Valor esperado", "@E 999,999,999.99", "", "N", "C6_QTDLIB"})
   aAdd(aC, {"ZLC_OBS", "C", 250, 0, "Observacao", "Observacao da cobranca", "", "", "N", "C2_OBS"})
   aAdd(aC, {"ZLC_CODUSR", "C", 6, 0, "Cod. Usuar.", "Codigo do usuario", "@!", "", "N", "C2_OBS"})
   aAdd(aC, {"ZLC_USUARI", "C", 25, 0, "Usuario", "Ultimo usuario", "", "", "N", "C2_OBS"})
   aAdd(aC, {"ZLC_DTALT", "D", 8, 0, "Dt. Alter.", "Data da ultima alteracao", "", "", "N", "C2_DATRF"})
   aAdd(aC, {"ZLC_HRALT", "C", 8, 0, "Hr. Alter.", "Hora da ultima alteracao", "99:99:99", "", "N", "C2_OBS"})
Return aC

Static Function IndicesZLC()
Return { ;
   {"1", "ZLC_FILIAL+ZLC_PEDIDO+ZLC_ITEM", "Pedido+Item"}, ;
   {"2", "ZLC_FILIAL+ZLC_SITUA+ZLC_PEDIDO+ZLC_ITEM", "Situacao+Pedido+Item"}}

Static Function CamposZLH()
   Local aC := {}
   aAdd(aC, {"ZLH_FILIAL", "C", 0, 0, "Filial", "Filial do sistema", "", "", "N", "C2_FILIAL"})
   aAdd(aC, {"ZLH_PEDIDO", "C", TamSX3("C5_NUM")[1], 0, "Pedido", "Pedido de venda", "@!", "", "S", "C2_OBS"})
   aAdd(aC, {"ZLH_ITEM", "C", 3, 0, "Item Cobr.", "Item da cobranca (ZLC)", "@!", "", "S", "C2_OBS"})
   aAdd(aC, {"ZLH_DATA", "D", 8, 0, "Data", "Data da alteracao", "", "", "S", "C2_DATRF"})
   aAdd(aC, {"ZLH_HORA", "C", 8, 0, "Hora", "Hora da alteracao", "99:99:99", "", "S", "C2_OBS"})
   aAdd(aC, {"ZLH_ACAO", "C", 1, 0, "Acao", "Acao", "@!", "I=Inclusao;A=Alteracao;E=Exclusao", "S", "C2_OBS"})
   aAdd(aC, {"ZLH_ORIGEM", "C", 1, 0, "Origem", "Onde foi alterado", "@!", "1=Tela;2=Importacao;3=Carga inicial", "S", "C2_OBS"})
   aAdd(aC, {"ZLH_CAMPO", "C", 10, 0, "Campo", "Campo alterado", "@!", "", "S", "C2_OBS"})
   aAdd(aC, {"ZLH_TITULO", "C", 30, 0, "Titulo", "Descricao do campo", "", "", "S", "C2_OBS"})
   aAdd(aC, {"ZLH_VALANT", "C", 250, 0, "Valor Ant.", "Valor antes", "", "", "N", "C2_OBS"})
   aAdd(aC, {"ZLH_VALNOV", "C", 250, 0, "Valor Novo", "Valor depois", "", "", "N", "C2_OBS"})
   aAdd(aC, {"ZLH_CODUSR", "C", 6, 0, "Cod. Usuar.", "Codigo do usuario", "@!", "", "N", "C2_OBS"})
   aAdd(aC, {"ZLH_USUARI", "C", 25, 0, "Usuario", "Nome do usuario", "", "", "S", "C2_OBS"})
Return aC

Static Function IndicesZLH()
Return { ;
   {"1", "ZLH_FILIAL+ZLH_PEDIDO+DTOS(ZLH_DATA)+ZLH_HORA", "Pedido+Data+Hora"}, ;
   {"2", "ZLH_FILIAL+DTOS(ZLH_DATA)+ZLH_HORA", "Data+Hora"}}

// Cria ou completa uma tabela (SX2, SX3, SIX e banco). lNovo = .T. se criou o SX2
Static Function CriaTab(cAli, cNome, cNomeEng, aC, aI, lNovo)
   Local cLog    := "--- " + cAli + " (" + cNome + ")" + CRLF
   Local bErrOld := ErrorBlock({|oE| Break(oE) })
   Local oErr    := Nil
   Local nI      := 0
   Local nNovos  := 0
   Local cArq    := ""

   Begin Sequence
      // ---------- SX2 ----------
      DbSelectArea("SX2")
      SX2->(DbSetOrder(1))
      If SX2->(DbSeek(cAli))
         If !(cNome $ Upper(SX2->X2_NOME))
            cLog += "PARADO: o alias " + cAli + " ja e de outra tabela (" + AllTrim(SX2->X2_NOME) + "). Nada foi alterado."
            Break
         EndIf
         cArq := AllTrim(SX2->X2_ARQUIVO)
         cLog += "SX2: " + cAli + " ja existe (" + cArq + "), mantido." + CRLF
      Else
         If !SX2->(DbSeek("SC2"))
            cLog += "PARADO: SX2 da SC2 (referencia) nao encontrado."
            Break
         EndIf
         cArq := cAli + SubStr(AllTrim(SX2->X2_ARQUIVO), 4)
         If TCCanOpen(cArq)
            cLog += "PARADO: a tabela " + cArq + " ja existe no banco sem dicionario. Confira antes de rodar."
            Break
         EndIf
         CopiaReg("SX2", { ;
            {"X2_CHAVE", cAli}, {"X2_ARQUIVO", cArq}, ;
            {"X2_NOME", cNome}, {"X2_NOMESPA", cNome}, {"X2_NOMEENG", cNomeEng}, ;
            {"X2_MODO", "E"}, {"X2_MODOUN", "E"}, {"X2_MODOEMP", "E"}, ;
            {"X2_UNICO", ""}, {"X2_ROTINA", ""}, {"X2_DISPLAY", ""}, {"X2_SYSOBJ", ""}, {"X2_USROBJ", ""}, ;
            {"X2_PYME", "S"}})
         lNovo := .T.
         cLog += "SX2: " + cAli + " criado (" + cArq + ", exclusivo por filial)." + CRLF
      EndIf

      // ---------- SX3 ----------
      DbSelectArea("SX3")
      For nI := 1 to Len(aC)
         SX3->(DbSetOrder(2)) // X3_CAMPO
         If SX3->(DbSeek(PadR(aC[nI][1], Len(SX3->X3_CAMPO))))
            Loop
         EndIf
         If !SX3->(DbSeek(PadR(aC[nI][10], Len(SX3->X3_CAMPO))))
            cLog += "PARADO: campo de referencia " + aC[nI][10] + " nao encontrado no SX3 (para " + aC[nI][1] + ")."
            Break
         EndIf
         CopiaReg("SX3", CamposSX3(cAli, aC[nI], nI))
         nNovos++
      Next nI
      cLog += "SX3: " + cValToChar(nNovos) + " campo(s) criado(s) de " + cValToChar(Len(aC)) + "." + CRLF

      // ---------- SIX ----------
      nNovos := 0
      DbSelectArea("SIX")
      SIX->(DbSetOrder(1))
      For nI := 1 to Len(aI)
         If SIX->(DbSeek(cAli + aI[nI][1]))
            Loop
         EndIf
         If !SIX->(DbSeek("SC2" + "1"))
            cLog += "PARADO: indice 1 da SC2 (referencia) nao encontrado no SIX."
            Break
         EndIf
         CopiaReg("SIX", { ;
            {"INDICE", cAli}, {"ORDEM", aI[nI][1]}, {"CHAVE", aI[nI][2]}, ;
            {"DESCRICAO", aI[nI][3]}, {"DESCSPA", aI[nI][3]}, {"DESCENG", aI[nI][3]}, ;
            {"PROPRI", "U"}, {"F3", ""}, {"NICKNAME", ""}, {"SHOWPESQ", "S"}})
         nNovos++
      Next nI
      cLog += "SIX: " + cValToChar(nNovos) + " indice(s) criado(s) de " + cValToChar(Len(aI)) + "." + CRLF

      // ---------- tabela fisica ----------
      __SetX31Mode(.F.)
      If Select(cAli) > 0
         (cAli)->(DbCloseArea())
      EndIf
      X31UpdTable(cAli)
      If __GetX31Error()
         cLog += "ERRO no X31UpdTable: " + __GetX31Trace() + CRLF
         Break
      EndIf
      DbSelectArea(cAli)
      cLog += "Tabela " + cArq + ": " + IIf(TCCanOpen(cArq), "existe no banco.", "NAO encontrada no banco: confira.") + CRLF
      For nI := 1 to Len(aC)
         If (cAli)->(FieldPos(aC[nI][1])) == 0
            cLog += "Campo " + aC[nI][1] + " nao aparece na tabela aberta." + CRLF
         EndIf
      Next nI

   Recover Using oErr
      If ValType(oErr) == "O"
         cLog += CRLF + "ERRO: " + AllTrim(oErr:Description) + CRLF + Left(oErr:ErrorStack, 1500)
      EndIf
   End Sequence
   ErrorBlock(bErrOld)
Return cLog

// Valores do SX3 de um campo novo (por cima do campo de referencia copiado)
Static Function CamposSX3(cAli, aF, nOrdem)
   Local aV   := {}
   Local lFil := (aF[1] == cAli + "_FILIAL")
   aAdd(aV, {"X3_ARQUIVO", cAli})
   aAdd(aV, {"X3_ORDEM", StrZero(nOrdem, 2)})
   aAdd(aV, {"X3_CAMPO", aF[1]})
   aAdd(aV, {"X3_PROPRI", "U"})
   aAdd(aV, {"X3_TITULO", aF[5]})
   aAdd(aV, {"X3_TITSPA", aF[5]})
   aAdd(aV, {"X3_TITENG", aF[5]})
   aAdd(aV, {"X3_DESCRIC", aF[6]})
   aAdd(aV, {"X3_DESCSPA", aF[6]})
   aAdd(aV, {"X3_DESCENG", aF[6]})
   If lFil
      // filial: mantem tamanho, grupo (SXG), uso e o resto do C2_FILIAL
      Return aV
   EndIf
   aAdd(aV, {"X3_TIPO", aF[2]})
   aAdd(aV, {"X3_TAMANHO", aF[3]})
   aAdd(aV, {"X3_DECIMAL", aF[4]})
   aAdd(aV, {"X3_PICTURE", aF[7]})
   aAdd(aV, {"X3_CBOX", aF[8]})
   aAdd(aV, {"X3_CBOXSPA", aF[8]})
   aAdd(aV, {"X3_CBOXENG", aF[8]})
   aAdd(aV, {"X3_BROWSE", aF[9]})
   aAdd(aV, {"X3_VISUAL", "A"})
   aAdd(aV, {"X3_CONTEXT", "R"})
   aAdd(aV, {"X3_VALID", ""})
   aAdd(aV, {"X3_VLDUSER", ""})
   aAdd(aV, {"X3_RELACAO", ""})
   aAdd(aV, {"X3_INIBRW", ""})
   aAdd(aV, {"X3_WHEN", ""})
   aAdd(aV, {"X3_F3", ""})
   aAdd(aV, {"X3_TRIGGER", ""})
   aAdd(aV, {"X3_GRPSXG", ""})
   aAdd(aV, {"X3_PICTVAR", ""})
   aAdd(aV, {"X3_FOLDER", ""})
   aAdd(aV, {"X3_CONDSQL", ""})
   aAdd(aV, {"X3_CHKSQL", ""})
   aAdd(aV, {"X3_AGRUP", ""})
   aAdd(aV, {"X3_PYME", "S"})
Return aV

// Novo registro no alias, copiado do registro posicionado, com os valores de
// aVals por cima (campo que nao existe no dicionario desta versao e ignorado)
Static Function CopiaReg(cAlias, aVals)
   Local aOrig := {}
   Local nI    := 0
   Local nPos  := 0
   For nI := 1 to (cAlias)->(FCount())
      aAdd(aOrig, (cAlias)->(FieldGet(nI)))
   Next nI
   RecLock(cAlias, .T.)
   For nI := 1 to Len(aOrig)
      (cAlias)->(FieldPut(nI, aOrig[nI]))
   Next nI
   For nI := 1 to Len(aVals)
      nPos := (cAlias)->(FieldPos(aVals[nI][1]))
      If nPos > 0
         (cAlias)->(FieldPut(nPos, aVals[nI][2]))
      EndIf
   Next nI
   (cAlias)->(MsUnlock())
Return

// ---------------------------------------------------------------- carga
// CTE e CTE da reentrega da SC5 -> ZLC (Envio / Reentrega), com historico
// (origem 3 = carga inicial). Pula pedido que ja tem cobranca na ZLC, mesmo
// excluida: rodar de novo nao duplica.
Static Function Carga()
   Local aCpo   := {"C5_ZCTE", "C5_ZVLRCTE", "C5_ZCTEREE", "C5_ZVCTERE", "C5_ZDTENV", "C5_ZNDENT"}
   Local aExist := {}
   Local cQuery := ""
   Local cCond  := ""
   Local cAl    := ""
   Local aLin   := {}
   Local nI     := 0
   Local nE     := 0
   Local nR     := 0
   Local nSomaE := 0
   Local nSomaR := 0
   Local cLog   := ""

   DbSelectArea("SC5")
   For nI := 1 to Len(aCpo)
      aAdd(aExist, SC5->(FieldPos(aCpo[nI])) > 0)
   Next nI
   If !aExist[1] .and. !aExist[2] .and. !aExist[3] .and. !aExist[4]
      MsgInfo("A SC5 deste ambiente nao tem os campos de CTE (C5_ZCTE, C5_ZVLRCTE, C5_ZCTEREE, C5_ZVCTERE). Nada a carregar.", UP_TIT)
      Return
   EndIf
   cCond := ""
   cCond += IIf(aExist[1], IIf(Empty(cCond), "", " OR ") + "SC5.C5_ZCTE <> ' '", "")
   cCond += IIf(aExist[2], IIf(Empty(cCond), "", " OR ") + "SC5.C5_ZVLRCTE <> 0", "")
   cCond += IIf(aExist[3], IIf(Empty(cCond), "", " OR ") + "SC5.C5_ZCTEREE <> ' '", "")
   cCond += IIf(aExist[4], IIf(Empty(cCond), "", " OR ") + "SC5.C5_ZVCTERE <> 0", "")
   cQuery := "SELECT SC5.C5_FILIAL AS FIL, SC5.C5_NUM AS NUM, SC5.C5_TRANSP AS TRANSP, "
   cQuery += IIf(aExist[1], "SC5.C5_ZCTE", "' '") + " AS CTE, "
   cQuery += IIf(aExist[2], "SC5.C5_ZVLRCTE", "0") + " AS VLR, "
   cQuery += IIf(aExist[3], "SC5.C5_ZCTEREE", "' '") + " AS CTER, "
   cQuery += IIf(aExist[4], "SC5.C5_ZVCTERE", "0") + " AS VLRR, "
   cQuery += IIf(aExist[5], "SC5.C5_ZDTENV", "' '") + " AS DTENV, "
   cQuery += IIf(aExist[6], "SC5.C5_ZNDENT", "' '") + " AS NDENT "
   cQuery += "FROM " + RetSqlName("SC5") + " SC5 "
   cQuery += "WHERE SC5.D_E_L_E_T_ = ' ' AND (" + cCond + ") "
   cQuery += "  AND NOT EXISTS (SELECT 1 FROM " + RetSqlName(TB_ZLC) + " ZLC "
   cQuery += "                   WHERE ZLC.ZLC_FILIAL = SC5.C5_FILIAL AND ZLC.ZLC_PEDIDO = SC5.C5_NUM) "
   cQuery += "ORDER BY SC5.C5_FILIAL, SC5.C5_NUM "
   cAl := MPSysOpenQuery(cQuery)
   Do While !(cAl)->(Eof())
      aAdd(aLin, {(cAl)->FIL, (cAl)->NUM, (cAl)->TRANSP, AllTrim(CStr((cAl)->CTE)), NumV((cAl)->VLR), ;
         AllTrim(CStr((cAl)->CTER)), NumV((cAl)->VLRR), STOD(AllTrim(CStr((cAl)->DTENV))), STOD(AllTrim(CStr((cAl)->NDENT)))})
      If !Empty(aLin[Len(aLin)][4]) .or. aLin[Len(aLin)][5] != 0
         nE++
         nSomaE += aLin[Len(aLin)][5]
      EndIf
      If !Empty(aLin[Len(aLin)][6]) .or. aLin[Len(aLin)][7] != 0
         nR++
         nSomaR += aLin[Len(aLin)][7]
      EndIf
      (cAl)->(DbSkip())
   EndDo
   (cAl)->(DbCloseArea())

   If Len(aLin) == 0
      MsgInfo("Nenhum pedido da SC5 com CTE para copiar (ou todos ja estao na " + TB_ZLC + ")." + CRLF + CRLF + Conferencia(), UP_TIT)
      Return
   EndIf
   If Aviso(UP_TIT + " - carga inicial", ;
         "Copiar os CTEs da SC5 para a " + TB_ZLC + ":" + CRLF + CRLF + ;
         "Pedidos: " + cValToChar(Len(aLin)) + CRLF + ;
         "Cobrancas de Envio: " + cValToChar(nE) + " (R$ " + AllTrim(Transform(nSomaE, "@E 999,999,999.99")) + ")" + CRLF + ;
         "Cobrancas de Reentrega: " + cValToChar(nR) + " (R$ " + AllTrim(Transform(nSomaR, "@E 999,999,999.99")) + ")" + CRLF + CRLF + ;
         "Os campos de CTE da SC5 nao sao alterados. Pedido que ja tem cobranca na " + TB_ZLC + " fica de fora.", ;
         {"Copiar", "Cancelar"}, 3) != 1
      Return
   EndIf
   FWMsgRun(, {|| cLog := GravaCarga(aLin) }, UP_TIT, "Copiando os CTEs...")
   Aviso(UP_TIT + " - carga inicial", cLog + CRLF + CRLF + Conferencia(), {"Ok"}, 3)
Return

Static Function GravaCarga(aLin)
   Local cLog    := ""
   Local bErrOld := ErrorBlock({|oE| Break(oE) })
   Local oErr    := Nil
   Local nI      := 0
   Local nCob    := 0
   Local cItem   := ""
   Local cCod    := ""
   Local cNom    := ""

   Begin Sequence
      cCod := AllTrim(RetCodUsr())
      cNom := Left(AllTrim(UsrRetName(cCod)), 25)
      DbSelectArea(TB_ZLC)
      DbSelectArea(TB_ZLH)
      For nI := 1 to Len(aLin)
         cItem := "000"
         If !Empty(aLin[nI][4]) .or. aLin[nI][5] != 0
            cItem := Soma1(cItem)
            NovaCob(aLin[nI], cItem, "E", aLin[nI][4], aLin[nI][5], aLin[nI][8], cCod, cNom)
            nCob++
         EndIf
         If !Empty(aLin[nI][6]) .or. aLin[nI][7] != 0
            cItem := Soma1(cItem)
            NovaCob(aLin[nI], cItem, "R", aLin[nI][6], aLin[nI][7], aLin[nI][9], cCod, cNom)
            nCob++
         EndIf
      Next nI
      cLog := "Carga concluida: " + cValToChar(nCob) + " cobranca(s) de " + cValToChar(Len(aLin)) + " pedido(s)."
   Recover Using oErr
      cLog := "ERRO na carga (" + cValToChar(nCob) + " cobranca(s) gravadas antes; rodar de novo pula esses pedidos): "
      If ValType(oErr) == "O"
         cLog += AllTrim(oErr:Description)
      EndIf
   End Sequence
   ErrorBlock(bErrOld)
Return cLog

// aL: {filial, pedido, transp, cte, vlr, cteR, vlrR, dtEnv, novaEnt}
Static Function NovaCob(aL, cItem, cTipo, cCte, nVal, dData, cCod, cNom)
   Local cRes := IIf(cTipo == "E", "Envio", "Reentrega") + IIf(Empty(cCte), "", " - CTE " + cCte) + ;
      " - R$ " + AllTrim(Transform(nVal, "@E 999,999,999.99"))
   RecLock(TB_ZLC, .T.)
   ZLC->ZLC_FILIAL := aL[1]
   ZLC->ZLC_PEDIDO := aL[2]
   ZLC->ZLC_ITEM   := cItem
   ZLC->ZLC_TIPO   := cTipo
   ZLC->ZLC_CTE    := cCte
   ZLC->ZLC_VALOR  := nVal
   ZLC->ZLC_DATA   := dData
   ZLC->ZLC_TRANSP := aL[3]
   ZLC->ZLC_CODUSR := cCod
   ZLC->ZLC_USUARI := cNom
   ZLC->ZLC_DTALT  := Date()
   ZLC->ZLC_HRALT  := Time()
   ZLC->(MsUnlock())
   RecLock(TB_ZLH, .T.)
   ZLH->ZLH_FILIAL := aL[1]
   ZLH->ZLH_PEDIDO := aL[2]
   ZLH->ZLH_ITEM   := cItem
   ZLH->ZLH_DATA   := Date()
   ZLH->ZLH_HORA   := Time()
   ZLH->ZLH_ACAO   := "I"
   ZLH->ZLH_ORIGEM := "3"
   ZLH->ZLH_CAMPO  := "ZLC"
   ZLH->ZLH_TITULO := "Cobranca incluida"
   ZLH->ZLH_VALANT := ""
   ZLH->ZLH_VALNOV := Left(cRes, 250)
   ZLH->ZLH_CODUSR := cCod
   ZLH->ZLH_USUARI := cNom
   ZLH->(MsUnlock())
Return

// Soma do CTE + CTE da reentrega na SC5 x soma das cobrancas E/R na ZLC
Static Function Conferencia()
   Local cAl    := ""
   Local nSC5   := 0
   Local nZLC   := 0
   Local cQuery := ""
   DbSelectArea("SC5")
   If SC5->(FieldPos("C5_ZVLRCTE")) == 0 .or. SC5->(FieldPos("C5_ZVCTERE")) == 0
      Return ""
   EndIf
   cQuery := "SELECT SUM(C5_ZVLRCTE + C5_ZVCTERE) AS TOT FROM " + RetSqlName("SC5") + " WHERE D_E_L_E_T_ = ' '"
   cAl := MPSysOpenQuery(cQuery)
   nSC5 := NumV((cAl)->TOT)
   (cAl)->(DbCloseArea())
   cQuery := "SELECT SUM(ZLC_VALOR) AS TOT FROM " + RetSqlName(TB_ZLC) + " WHERE D_E_L_E_T_ = ' ' AND ZLC_TIPO IN ('E','R')"
   cAl := MPSysOpenQuery(cQuery)
   nZLC := NumV((cAl)->TOT)
   (cAl)->(DbCloseArea())
Return "Conferencia - CTE + reentrega na SC5: R$ " + AllTrim(Transform(nSC5, "@E 999,999,999.99")) + ;
   "  /  Envio + Reentrega na " + TB_ZLC + ": R$ " + AllTrim(Transform(nZLC, "@E 999,999,999.99")) + ;
   IIf(Round(nSC5, 2) == Round(nZLC, 2), "  (conferem)", ;
   "  (DIFERENTES: cobrancas lancadas ou alteradas pela tela depois da carga mudam a soma da " + TB_ZLC + ")")

Static Function NumV(xV)
Return IIf(ValType(xV) == "N", xV, 0)

Static Function CStr(xV)
Return IIf(ValType(xV) == "C", xV, "")
