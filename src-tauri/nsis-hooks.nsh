!macro RecreateShortcut shortcut
  CreateShortcut "${shortcut}" "$INSTDIR\${MAINBINARYNAME}.exe"
  !insertmacro SetLnkAppUserModelId "${shortcut}"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $UpdateMode = 1
    !insertmacro RecreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    !insertmacro RecreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk"
  ${EndIf}
!macroend
