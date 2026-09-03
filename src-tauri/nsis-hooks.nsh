!macro NSIS_HOOK_POSTINSTALL
  ; Always recreate desktop shortcut so updates don't leave a broken link
  CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  !insertmacro SetLnkAppUserModelId "$DESKTOP\${PRODUCTNAME}.lnk"
!macroend
