#include "totvs.ch"

#define UP_TAB    "SC5"
#define UP_PREF   "C5_Z"
#define UP_PASTA  "\logrelupd\"
#define UP_TIT    "LOGRELUPD"

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

Campo que ja existe na producao NUNCA e alterado (so aparece na previa).
Pode rodar de novo: so cria o que falta.
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
      "Fora do expediente.", ;
      {"Exportar", "Importar", "Cancelar"}, 3)
   If nOpc == 1
      Exporta()
   ElseIf nOpc == 2
      Importa()
   EndIf
Return

// Campos que a API RESTLOGREL usa (para avisar se algum nao veio)
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
         cPrev += "  " + cCampo + " " + Valor(aCpo[nI], "X3_TIPO") + " " + ;
            cValToChar(Valor(aCpo[nI], "X3_TAMANHO")) + ;
            IIf(Valor(aCpo[nI], "X3_DECIMAL") > 0, "," + cValToChar(Valor(aCpo[nI], "X3_DECIMAL")), "") + ;
            " - " + AllTrim(Valor(aCpo[nI], "X3_TITULO")) + CRLF
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
      If !SX7->(DbSeek(Valor(aGat[nI], "X7_CAMPO") + Valor(aGat[nI], "X7_SEQUENC")))
         aAdd(aGNov, aGat[nI])
      EndIf
   Next nI

   cPrev := "Ambiente: " + GetEnvServer() + "  /  empresa " + cEmpAnt + CRLF + ;
      "Arquivo: " + cNome + " (de " + cValToChar(oJ["origem"]) + ", " + cValToChar(oJ["data"]) + ")" + CRLF + CRLF + ;
      "CRIAR " + cValToChar(Len(aNovos)) + " campo(s):" + CRLF + IIf(Empty(cPrev), "  nenhum" + CRLF, cPrev) + CRLF + ;
      "Gatilhos (SX7) a criar: " + cValToChar(Len(aGNov)) + " de " + cValToChar(Len(aGat)) + CRLF + CRLF + ;
      IIf(Empty(cDif), "", "JA EXISTEM COM OUTRA DEFINICAO (nao serao alterados, conferir a mao):" + CRLF + cDif + CRLF) + ;
      IIf(Empty(cJa), "", "Ja existem iguais (mantidos): " + cJa + CRLF + CRLF) + ;
      IIf(Empty(cFalta), "", "ATENCAO, a API usa e nao vieram no arquivo: " + cFalta + CRLF + CRLF)

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
