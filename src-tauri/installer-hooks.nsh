; Ganchos do instalador NSIS.
; O aplicativo guarda o banco em %APPDATA%\br.com.djenpublicacoes.desktop, fora da pasta do executável,
; para que reinstalar nunca apague as publicações sem que a pessoa escolha.

!macro NSIS_HOOK_POSTUNINSTALL
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Deseja apagar também as publicações, as OABs cadastradas e as preferências guardadas neste computador?$\r$\n$\r$\nEscolha Não se pretende reinstalar o DJEN Publicações depois." \
    /SD IDNO IDNO djen_manter_dados
    RMDir /r "$APPDATA\br.com.djenpublicacoes.desktop"
  djen_manter_dados:
!macroend
