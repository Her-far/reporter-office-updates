Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
Name "전기신문 Office AI 웹 테스트"
OutFile "${OUTPUT}"
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\ElectimesOffice-AIWeb-Test"
InstallDirRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOfficeAIWebTest" "InstallLocation"
SetCompressor /SOLID lzma
VIProductVersion "1.0.12.3"
VIAddVersionKey "ProductName" "전기신문 Office AI 웹 테스트"
VIAddVersionKey "FileDescription" "정식판과 분리된 AI 웹 브라우저 테스트판"
VIAddVersionKey "FileVersion" "1.0.12.3"
VIAddVersionKey "LegalCopyright" "Original Apache-2.0 and component notices retained"
!define MUI_ICON "${PACKAGE}\electimes-office.ico"
!define MUI_UNICON "${PACKAGE}\electimes-office.ico"
!ifdef COMPACT
!define MUI_WELCOMEPAGE_TEXT "정식판 1.0.12의 공통 파일을 PC 안에서 복사해 별도 테스트판을 설치합니다.$\r$\n$\r$\n정식판과 설정·로그인·자동 업데이트가 분리됩니다. 정식판 1.0.12가 없으면 전체 테스트 설치파일을 사용하세요."
!else
!define MUI_WELCOMEPAGE_TEXT "AI 탭에서 문서 도우미와 ChatGPT·Claude·Gemini 웹 브라우저를 전환합니다.$\r$\n$\r$\n정식판과 별도 설치되며, 정식판의 설정·로그인·자동 업데이트를 바꾸지 않습니다."
!endif
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\ElectimesOffice-AIWeb-Test.exe"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Korean"
Var OfficialDir
!macro CheckBusy
IfFileExists "$INSTDIR\ElectimesOffice-AIWeb-Test.exe" 0 not_busy
System::Call 'kernel32::CreateFileW(w "$INSTDIR\ElectimesOffice-AIWeb-Test.exe", i 0x40000000, i 1, p 0, i 3, i 0, p 0) p .r0'
${If} $0 == -1
 IfSilent +2
 MessageBox MB_OK|MB_ICONEXCLAMATION "AI 웹 테스트판을 종료한 뒤 다시 실행해 주세요."
 SetErrorLevel 5
 Abort
${EndIf}
System::Call 'kernel32::CloseHandle(p r0)'
not_busy:
!macroend
Section "Install"
SetShellVarContext current
SetRegView 64
IfFileExists "$INSTDIR\Electimes Office.exe" 0 target_ok
IfSilent +2
MessageBox MB_OK|MB_ICONEXCLAMATION "정식판 폴더에는 테스트판을 설치할 수 없습니다. 별도 폴더를 선택해 주세요."
SetErrorLevel 4
Abort
target_ok:
!insertmacro CheckBusy
!ifdef COMPACT
ReadRegStr $OfficialDir HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOffice" "InstallLocation"
${If} $OfficialDir == ""
 StrCpy $OfficialDir "$LOCALAPPDATA\Programs\ElectimesOffice"
${EndIf}
InitPluginsDir
SetOutPath "$PLUGINSDIR"
File "${PACKAGE}\copy-base.ps1"
File "${PACKAGE}\base-manifest.json"
nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\copy-base.ps1" -Source "$OfficialDir" -Target "$INSTDIR" -Manifest "$PLUGINSDIR\base-manifest.json"'
Pop $0
Pop $1
${If} $0 != 0
 IfSilent +2
 MessageBox MB_OK|MB_ICONEXCLAMATION "정식판 1.0.12의 공통 파일을 확인하지 못했습니다. 정식판을 업데이트하거나 전체 테스트 설치파일을 사용해 주세요."
 SetErrorLevel 4
 Abort
${EndIf}
!endif
SetOutPath "$INSTDIR"
SetOverwrite on
ClearErrors
File /r "${PAYLOAD}\*"
IfErrors failed
Delete "$INSTDIR\resources\electimes-update-source.json"
Delete "$INSTDIR\resources\app-update.yml"
WriteUninstaller "$INSTDIR\Uninstall-AIWeb-Test.exe"
CreateDirectory "$SMPROGRAMS\전기신문 Office AI 웹 테스트"
CreateShortCut "$SMPROGRAMS\전기신문 Office AI 웹 테스트\전기신문 Office AI 웹 테스트.lnk" "$INSTDIR\ElectimesOffice-AIWeb-Test.exe"
CreateShortCut "$DESKTOP\전기신문 Office AI 웹 테스트.lnk" "$INSTDIR\ElectimesOffice-AIWeb-Test.exe"
WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOfficeAIWebTest" "DisplayName" "전기신문 Office AI 웹 테스트"
WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOfficeAIWebTest" "DisplayVersion" "1.0.12-aiweb.3"
WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOfficeAIWebTest" "InstallLocation" "$INSTDIR"
WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOfficeAIWebTest" "UninstallString" '$\"$INSTDIR\Uninstall-AIWeb-Test.exe$\"'
WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOfficeAIWebTest" "DisplayIcon" "$INSTDIR\ElectimesOffice-AIWeb-Test.exe"
WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOfficeAIWebTest" "NoModify" 1
WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOfficeAIWebTest" "NoRepair" 1
SetErrorLevel 0
Goto done
failed:
SetErrorLevel 6
Abort "테스트판 설치 파일을 쓰지 못했습니다."
done:
SectionEnd
Section "Uninstall"
SetShellVarContext current
SetRegView 64
!insertmacro CheckBusy
DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOfficeAIWebTest"
Delete "$DESKTOP\전기신문 Office AI 웹 테스트.lnk"
Delete "$SMPROGRAMS\전기신문 Office AI 웹 테스트\전기신문 Office AI 웹 테스트.lnk"
RMDir "$SMPROGRAMS\전기신문 Office AI 웹 테스트"
!include "${PACKAGE}\uninstall-files.nsh"
Delete "$INSTDIR\Uninstall-AIWeb-Test.exe"
RMDir "$INSTDIR"
SectionEnd
