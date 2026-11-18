#include "totvs.ch"

/*/{Protheus.doc} LOGRELAPP
Abre a tela PO UI de Logistica (pedidos de entrega), recurso logrel.app no RPO.
Os dados vem da API RESTLOGREL.tlpp (GET/PUT /logistica/pedidos), chamada com o
token do usuario logado. Colocar no menu (SIGAFAT) apontando para U_LOGRELAPP:
o acesso e pelo menu (a API nao tem trava propria desde 18/11/2026).
@type function
@author Romulo Garcia
@since 13/11/2026
/*/
User Function LOGRELAPP()
   Local aApps := GetResArray("*.app")
   Local cLista := ""
   Local nI := 0

   // Sem console no TOTVS Cloud: se o recurso nao estiver no RPO, mostra na
   // tela quais .app existem (diagnostico do "Aplicativo nao encontrado")
   If aScan(aApps, {|x| Lower(AllTrim(x)) == "logrel.app"}) == 0
      For nI := 1 to Len(aApps)
         cLista += AllTrim(aApps[nI]) + CRLF
      Next nI
      MsgStop("Recurso logrel.app nao esta compilado neste RPO." + CRLF + CRLF + ;
         "Recursos .app encontrados (" + cValToChar(Len(aApps)) + "):" + CRLF + ;
         IIf(Empty(cLista), "(nenhum)", cLista), "LOGRELAPP")
      Return
   EndIf

   FwCallApp("logrel")
Return

/*/{Protheus.doc} JsToAdvpl
Mensagens do app para o ADVPL (exigida pelo FwCallApp no mesmo fonte).
O fechamento e tratado pelo framework. Desde 15/11/2026 (pedido do usuario):
  - "danfe": imprime o DANFE da nota pela rotina padrao da SPEDNFE (SpedDanfe),
    com as perguntas (NFSIGW) ja preenchidas com a nota;
  A carta de correcao ("cce"/"cceimp") existiu de 15 a 16/11/2026 e foi
  retirada a pedido do usuario: a digitacao abria, mas a impressao da CC-e
  nao fica no menu da SPEDNFE deste ambiente e a busca da rotina chegou a
  travar a tela. A CC-e continua sendo feita e impressa pela SPEDNFE.
Conteudo = JSON {"nota": "000123", "serie": "1", "pedido": "000001"}.
Roda na thread do SmartClient: as telas padrao abrem normalmente por cima do app.
@type function
/*/
Static Function JsToAdvpl(oWebChannel, cType, cContent)
   Local jDados := Nil
   Local xErr   := Nil

   If cType == "danfe"
      jDados := JsonObject():New()
      xErr := jDados:FromJson(IIf(ValType(cContent) == "C", cContent, ""))
      If ValType(xErr) == "C"
         MsgStop("Dados da nota invalidos: " + IIf(ValType(cContent) == "C", cContent, "(vazio)"), "LOGRELAPP")
         Return .T.
      EndIf
      AcaoNota(Txt(jDados["nota"]), Txt(jDados["serie"]), Txt(jDados["pedido"]))
   EndIf
Return .T.

// Posiciona a SF2 e chama a rotina padrao, mostrando na tela qualquer erro
// (sem console no TOTVS Cloud, o usuario manda o texto da mensagem)
Static Function AcaoNota(cNota, cSerie, cPedido)
   Local aArea   := GetArea()
   Local aAreaF2 := SF2->(GetArea())
   Local bErrOld := ErrorBlock({|oE| Break(oE) })
   Local oErr    := Nil
   Local cRotulo := "DANFE"

   If Empty(cNota)
      MsgStop("Pedido " + cPedido + " sem nota fiscal.", "LOGRELAPP")
   Else
      DbSelectArea("SF2")
      SF2->(DbSetOrder(1)) // F2_FILIAL+F2_DOC+F2_SERIE+F2_CLIENTE+F2_LOJA
      If !SF2->(DbSeek(xFilial("SF2") + PadR(cNota, TamSX3("F2_DOC")[1]) + PadR(cSerie, TamSX3("F2_SERIE")[1])))
         MsgStop("Nota " + cNota + " serie " + cSerie + " nao encontrada nesta filial (SF2).", "LOGRELAPP")
      ElseIf SemChave() .and. !MsgYesNo("A nota " + cNota + " nao tem chave de NF-e (F2_CHVNFE vazia): parece que ainda nao foi transmitida/autorizada." + CRLF + "Abrir " + cRotulo + " mesmo assim?", "LOGRELAPP")
         // usuario desistiu
      Else
         Begin Sequence
            ImprDanfe(cNota, cSerie)
         Recover Using oErr
            MsgStop("Erro ao abrir " + cRotulo + " da nota " + cNota + "/" + cSerie + ":" + CRLF + CRLF + ;
               TxtErro(oErr), "LOGRELAPP")
         End Sequence
      EndIf
   EndIf

   ErrorBlock(bErrOld)
   SF2->(RestArea(aAreaF2))
   RestArea(aArea)
Return

// DANFE: SpedDanfe (rotina "Danfe" da SPEDNFE), perguntas NFSIGW preenchidas
Static Function ImprDanfe(cNota, cSerie)
   // variaveis que as rotinas da SPEDNFE costumam esperar do browse
   Private cCadastro  := "DANFE"
   Private aRotina    := {}
   Private bFiltraBrw := {|| .T. }
   Private aFilBrw    := {"SF2", ""}

   If !FindFunction("SPEDDANFE")
      MsgStop("A rotina SpedDanfe nao foi encontrada no RPO." + CRLF + CRLF + ;
         "Funcoes com DANFE no RPO:" + CRLF + ListaFuncoes("*DANFE*") + CRLF + ;
         "Funcoes PRTNFE no RPO:" + CRLF + ListaFuncoes("*PRTNFE*"), "LOGRELAPP")
      Return
   EndIf
   PreenchePerg("NFSIGW", cNota, cSerie)
   SpedDanfe()
Return

// Perguntas do DANFE ja com a nota (pelo texto da pergunta, para nao depender
// da ordem): da/ate nota, serie e tipo de operacao = saida. Se algo falhar, o
// usuario so preenche na tela da pergunta, como faz hoje.
Static Function PreenchePerg(cGrupo, cNota, cSerie)
   Local bErrOld := ErrorBlock({|oE| Break(oE) })
   Local cTxt    := ""
   Local cPar    := ""
   Local cGrp    := ""

   Begin Sequence
      If !FindFunction("SETMVVALUE")
         Break
      EndIf
      DbSelectArea("SX1")
      SX1->(DbSetOrder(1))
      cGrp := PadR(cGrupo, Len(SX1->X1_GRUPO))
      If SX1->(DbSeek(cGrp))
         Do While !SX1->(Eof()) .and. SX1->X1_GRUPO == cGrp
            cTxt := Upper(AllTrim(SX1->X1_PERGUNT))
            If FindFunction("FWNOACCENT")
               cTxt := FwNoAccent(cTxt)
            EndIf
            cPar := "MV_PAR" + StrZero(Val(SX1->X1_ORDEM), 2)
            If "NOTA" $ cTxt .and. "ATE" $ cTxt
               SetMVValue(cGrupo, cPar, cNota)
            ElseIf "NOTA" $ cTxt
               SetMVValue(cGrupo, cPar, cNota)
            ElseIf "SERIE" $ cTxt
               SetMVValue(cGrupo, cPar, cSerie)
            ElseIf "OPERA" $ cTxt
               SetMVValue(cGrupo, cPar, 2) // 1=Entrada 2=Saida
            EndIf
            SX1->(DbSkip())
         EndDo
      EndIf
   Recover
      // sem preenchimento automatico: a pergunta abre com os ultimos valores
   End Sequence
   ErrorBlock(bErrOld)
Return

Static Function SemChave()
Return SF2->(FieldPos("F2_CHVNFE")) > 0 .and. Empty(SF2->F2_CHVNFE)

Static Function ListaFuncoes(cMascara)
   Local aF   := GetFuncArray(cMascara)
   Local cRet := ""
   Local nI   := 0
   For nI := 1 to Min(Len(aF), 40)
      cRet += AllTrim(aF[nI]) + IIf(nI < Min(Len(aF), 40), ", ", "")
   Next nI
Return IIf(Empty(cRet), "(nenhuma)", cRet + IIf(Len(aF) > 40, " ... (" + cValToChar(Len(aF)) + " no total)", ""))

Static Function TxtErro(oErr)
   Local cRet := ""
   If ValType(oErr) == "O"
      cRet := AllTrim(oErr:Description)
      If !Empty(oErr:ErrorStack)
         cRet += CRLF + CRLF + Left(oErr:ErrorStack, 1200)
      EndIf
   EndIf
Return IIf(Empty(cRet), "erro sem descricao", cRet)

Static Function Txt(xV)
Return IIf(ValType(xV) == "C", AllTrim(xV), IIf(ValType(xV) == "N", cValToChar(xV), ""))
