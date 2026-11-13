#include "totvs.ch"

/*/{Protheus.doc} LOGRELAPP
Abre a tela PO UI de Logistica (pedidos de entrega), recurso logrel.app no RPO.
Os dados vem da API RESTLOGREL.tlpp (GET/PUT /logistica/pedidos), chamada com o
token do usuario logado. Colocar no menu (SIGAFAT) apontando para U_LOGRELAPP:
a API libera quem tem esta rotina no menu (U_VSAPIACE com "U_LOGRELAPP").
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
Hoje o app nao manda nada alem do fechamento, tratado pelo framework.
@type function
/*/
Static Function JsToAdvpl(oWebChannel, cType, cContent)
Return
