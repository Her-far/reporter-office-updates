; Direct native extraction, no temporary PowerShell unpack/verify pipeline.
Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "StrFunc.nsh"
${StrStr}
!include "${WORK}/associations-109.nsh"
Name "전기신문 오피스"
OutFile "${OUTPUT}"
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\ElectimesOffice"
InstallDirRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOffice" "InstallLocation"
SetCompressor zlib
SetDatablockOptimize on
VIProductVersion "1.0.9.0"
VIAddVersionKey "ProductName" "전기신문 오피스"
VIAddVersionKey "FileDescription" "전기신문 오피스 설치 및 업데이트"
VIAddVersionKey "FileVersion" "1.0.9"
VIAddVersionKey "LegalCopyright" "Apache-2.0 and original component notices included"
!define MUI_ICON "${WORK}/brand/electimes-office.ico"
!define MUI_UNICON "${WORK}/brand/electimes-office.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "${WORK}/brand/welcome.bmp"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "${WORK}/brand/header.bmp"
!ifdef PATCH
!define MUI_WELCOMEPAGE_TEXT "전기신문 오피스 1.0.3~1.0.5를 1.0.9로 업데이트합니다.$\r$\n$\r$\n문서를 저장하고 오피스를 종료해 주세요. 다음 화면에서 기존 Electimes Office.exe가 있는 폴더를 선택하세요."
!else
!define MUI_WELCOMEPAGE_TEXT "전기신문 오피스 1.0.9를 설치합니다.$\r$\n$\r$\n기존 오피스가 실행 중이면 문서를 저장하고 종료해 주세요. 문서와 사용자 설정은 유지됩니다."
!endif
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\Electimes Office.exe"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Korean"

!macro CheckBusy
IfFileExists "$INSTDIR\Electimes Office.exe" 0 not_busy
System::Call 'kernel32::CreateFileW(w "$INSTDIR\Electimes Office.exe", i 0x40000000, i 1, p 0, i 3, i 0, p 0) p .r0'
${If} $0 == -1
  IfSilent +2
  MessageBox MB_OK|MB_ICONEXCLAMATION "오피스가 실행 중이거나 설치 폴더에 쓸 수 없습니다. 문서를 저장하고 오피스를 종료한 뒤 다시 실행해 주세요."
  SetErrorLevel 5
  Abort
${EndIf}
System::Call 'kernel32::CloseHandle(p r0)'
not_busy:
!macroend

Section "Install"
SetShellVarContext current
SetRegView 64
!ifdef PATCH
IfFileExists "$INSTDIR\Electimes Office.exe" 0 wrong_base
IfFileExists "$INSTDIR\resources\doc-reader\electimes_doc_reader_bg.wasm" 0 wrong_base
FileOpen $0 "$INSTDIR\resources\electimes-version.json" r
IfErrors wrong_base
FileRead $0 $1
FileClose $0
${StrStr} $2 $1 '1.0.3'
${If} $2 == ""
  ${StrStr} $2 $1 '1.0.4'
  ${If} $2 == ""
    ${StrStr} $2 $1 '1.0.5'
    ${If} $2 == ""
      ${StrStr} $2 $1 '1.0.9'
    ${EndIf}
  ${EndIf}
  ${If} $2 == ""
    Goto wrong_base
  ${EndIf}
${EndIf}
Goto base_ok
wrong_base:
IfSilent +2
MessageBox MB_OK|MB_ICONEXCLAMATION "1.0.3~1.0.5 오피스 폴더를 선택해 주세요. 이전 버전에는 전체 설치판을 사용해 주세요."
SetErrorLevel 4
Abort
base_ok:
!endif
!insertmacro CheckBusy
; Preserve an existing local-only OAuth app registration before replacing ASAR.
; First launch encrypts that registration in the user's vault and removes this backup.
IfFileExists "$INSTDIR\resources\workpanel-upgrade.asar" local_config_saved
IfFileExists "$INSTDIR\resources\app.asar" 0 local_config_saved
ClearErrors
CopyFiles /SILENT "$INSTDIR\resources\app.asar" "$INSTDIR\resources\workpanel-upgrade.asar"
IfErrors install_failed
local_config_saved:
SetOutPath "$INSTDIR"
SetOverwrite on
ClearErrors
File /r "${PAYLOAD}/*"
IfErrors install_failed
!insertmacro RegisterCompany
!ifndef PATCH
; Only retired application components are removed; profiles and documents stay.
RMDir /r "$INSTDIR\resources\doc-converter"
Delete "$INSTDIR\resources\quicklook\win-quicklook.exe"
WriteUninstaller "$INSTDIR\Uninstall.exe"
CreateDirectory "$SMPROGRAMS\전기신문 오피스"
CreateShortCut "$SMPROGRAMS\전기신문 오피스\전기신문 오피스.lnk" "$INSTDIR\Electimes Office.exe"
CreateShortCut "$DESKTOP\전기신문 오피스.lnk" "$INSTDIR\Electimes Office.exe"
WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOffice" "DisplayName" "전기신문 오피스"
WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOffice" "DisplayVersion" "1.0.9"
WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOffice" "InstallLocation" "$INSTDIR"
WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOffice" "DisplayIcon" "$INSTDIR\Electimes Office.exe"
WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOffice" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOffice" "NoModify" 1
WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOffice" "NoRepair" 1
!else
ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOffice" "InstallLocation"
${If} $0 == $INSTDIR
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOffice" "DisplayVersion" "1.0.9"
${EndIf}
!endif
System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
SetErrorLevel 0
Goto installed
install_failed:
SetErrorLevel 6
Abort "설치 파일을 쓰지 못했습니다. 오피스를 종료하고 다시 설치해 주세요."
installed:
SectionEnd

Section "Uninstall"
SetShellVarContext current
SetRegView 64
!insertmacro CheckBusy
!insertmacro UnregisterCompany
ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOffice" "InstallLocation"
${If} $0 == $INSTDIR
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ElectimesOffice"
  Delete "$SMPROGRAMS\전기신문 오피스\전기신문 오피스.lnk"
  RMDir "$SMPROGRAMS\전기신문 오피스"
  Delete "$DESKTOP\전기신문 오피스.lnk"
${EndIf}
!include "${WORK}/uninstall-files-109.nsh"
SectionEnd
