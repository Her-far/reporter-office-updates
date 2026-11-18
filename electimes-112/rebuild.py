from pathlib import Path
import hashlib,json,os,shutil,subprocess,sys
root=Path(__file__).resolve().parent;stage=root/'stage';base=root/'base-installer';previous=root.parent/'electimes-109'
sha=lambda p:hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
seven=os.environ.get('SEVENZIP','7z')
manifest={p.relative_to(stage).as_posix():sha(p) for p in stage.rglob('*') if p.is_file()}
if '--snapshot' in sys.argv:
 (root/'payload-manifest.json').write_text(json.dumps(manifest));sys.exit(0)
# Tests must not edit the candidate application payload.
expected=json.loads((root/'payload-manifest.json').read_text())
assert manifest==expected,'Candidate changed during verification'
package=root/'package';(package/'brand').mkdir(parents=True,exist_ok=True)
for name in ['electimes-office.ico','welcome.bmp','header.bmp']:shutil.copy2(root.parent/'electimes-104'/name,package/'brand'/name)
shutil.copy2(previous/'associations-109.nsh',package/'associations-109.nsh')
subprocess.run(['python',str(previous/'workpanel/build/uninstall-manifest.py'),str(stage),str(package/'uninstall-files-109.nsh')],check=True)
script=(previous/'setup-109.nsi').read_text(encoding='utf-8-sig').replace('1.0.9','1.0.12')
start=script.index('!ifdef PATCH\nIfFileExists')
end=script.index('!endif\n!insertmacro CheckBusy',start)
script=script[:start]+'''!ifdef PATCH
IfFileExists "$INSTDIR\\Electimes Office.exe" 0 wrong_base
IfFileExists "$INSTDIR\\resources\\app.asar" 0 wrong_base
FileOpen $0 "$INSTDIR\\resources\\electimes-version.json" r
IfErrors wrong_base
FileRead $0 $1
FileClose $0
StrCmp $1 '{"version":"1.0.11","build":111}' base_ok
StrCmp $1 '{"version":"1.0.12","build":112}' base_ok
wrong_base:
IfSilent +2
MessageBox MB_OK|MB_ICONEXCLAMATION "이 업데이트는 전기신문 Office 1.0.11용입니다. 이전 버전에는 전체 설치판을 사용해 주세요."
SetErrorLevel 4
Abort
base_ok:
'''+script[end:]
script=script.replace('전기신문 오피스 1.0.3~1.0.5를 1.0.12로 업데이트합니다.','전기신문 오피스 1.0.11을 1.0.12로 업데이트합니다.')
# Both the full installer and the small update regenerate the uninstall inventory,
# so the new native module is not left behind when the application is uninstalled.
script=script.replace('!insertmacro RegisterCompany\n!ifndef PATCH','!insertmacro RegisterCompany\nWriteUninstaller "$INSTDIR\\Uninstall.exe"\n!ifndef PATCH')
script=script.replace('WriteUninstaller "$INSTDIR\\Uninstall.exe"\nCreateDirectory','CreateDirectory')
if os.name=='nt':script=script.replace('${WORK}/brand/','${WORK}\\brand\\').replace('${WORK}/','${WORK}\\').replace('${PAYLOAD}/*','${PAYLOAD}\\*')
target_script=package/'setup-112.nsi';target_script.write_text(script,encoding='utf-8-sig')
patch=root/'patch-payload';patch.mkdir(exist_ok=True)
changed=[]
for name,digest in manifest.items():
 if (base/name).is_file() and sha(base/name)==digest:continue
 changed.append(name);dest=patch/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(stage/name,dest)
assert 'resources/app.asar' in changed
assert not any(name.endswith('.wasm') for name in changed),'Print-only update must preserve all document engines'
flag='/' if os.name=='nt' else '-'
entries={}
for kind,payload in [('Setup',stage),('Update',patch)]:
 output=root/f'ElectimesOffice-{kind}-1.0.12-x64.exe'
 args=[os.environ['MAKENSIS'],flag+'V2',flag+'DWORK='+str(package),flag+'DPAYLOAD='+str(payload),flag+'DOUTPUT='+str(output)]
 if kind=='Update':args+=[flag+'DPATCH']
 subprocess.run(args+[str(target_script)],check=True)
 check=root/('installer-check' if kind=='Setup' else 'patch-check')
 subprocess.run([seven,'x',str(output),'-o'+str(check),'-y'],check=True,stdout=subprocess.DEVNULL)
 names=manifest if kind=='Setup' else changed
 assert all((check/name).is_file() and sha(check/name)==manifest[name] for name in names),'Installer payload mismatch'
 entries[kind]={'url':'https://github.com/Her-far/reporter-office-updates/releases/download/electimes-v1.0.12/'+output.name,'size':output.stat().st_size,'sha256':sha(output)}
assert entries['Update']['size'] < 40*1024*1024,'Unexpectedly large patch'
feed={'product':'electimes-office','platform':'win32-x64','version':'1.0.12','build':112,'minBuild':111,'maxBuild':111,'notes':['Windows 인쇄 기본 설정창과 내부 항목을 동일한 화면 배율로 표시하도록 호환성을 개선했습니다.','HWP 인쇄 설정창이 오피스 앞에 표시되도록 임시 인쇄창 처리를 수정했습니다.','1.0.11에서는 변경 파일만 다운로드합니다. 이전 버전은 전체 설치판으로 업데이트합니다.','1.0.11의 HWP 붙여넣기·줄 간격 및 이전 패널 수정은 유지합니다.'],'installer':entries['Update'],'fullInstaller':entries['Setup']}
(root/'electimes-latest.json').write_text(json.dumps(feed,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(root/'ElectimesOffice-SHA256SUMS-1.0.12.txt').write_text(''.join(e['sha256']+'  '+e['url'].split('/')[-1]+'\n' for e in entries.values()))
(root/'package-windows.json').write_text(json.dumps({'version':'1.0.12','verifiedPayloadFiles':len(manifest),'patchFiles':changed,'entries':entries},indent=2))
print(json.dumps({'entries':entries,'changedFiles':len(changed),'preservedFiles':len(manifest)-len(changed)}))
