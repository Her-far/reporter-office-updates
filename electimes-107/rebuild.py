from pathlib import Path
import hashlib,json,os,shutil,struct,subprocess,sys
root=Path.cwd();stage=root/'stage';pkg=root/'package';pkg.mkdir(exist_ok=True)
sha=lambda p:hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
seven=os.environ.get('SEVENZIP','7z')
if '--stage-only' in sys.argv:
 assert sha(root/'base.exe')=='c75c2e9bf68e362c394ee078ad1c301c4c97476a399e336899598e50e8328ebc','Published base mismatch'
 subprocess.run([seven,'x',str(root/'base.exe'),'-o'+str(root/'base-installer'),'-y'],check=True,stdout=subprocess.DEVNULL)
 env={**os.environ,'PUBLIC_RELEASE':'1'}
 env.pop('WORKPANEL_GOOGLE_OAUTH_FILE',None)
 subprocess.run(['node','workpanel/build/build.cjs',str(root/'base-installer'),str(stage)],check=True,env=env,stdout=subprocess.DEVNULL)
 actual={p.relative_to(stage).as_posix():sha(p) for p in stage.rglob('*') if p.is_file()}
 (root/'payload-manifest.json').write_text(json.dumps(actual))
else:
 actual=json.loads((root/'payload-manifest.json').read_text())
 assert actual=={p.relative_to(stage).as_posix():sha(p) for p in stage.rglob('*') if p.is_file()},'Payload changed after native validation'
# Public releases never contain a bundled Google OAuth credential file.
asar=(stage/'resources/app.asar').read_bytes()
header=json.loads(asar[16:16+struct.unpack_from('<I',asar,12)[0]])
wp=header['files']['out']['files']['main']['files']['work-panel']['files']
assert 'google-client.json' not in wp,'Bundled Google credentials are forbidden in public releases'
if '--stage-only' in sys.argv:
 print(json.dumps({'stageVerified':len(actual),'builtFromSource':True,'bundledGoogleCredentials':False}));sys.exit(0)
(pkg/'brand').mkdir(exist_ok=True)
for name in ['electimes-office.ico','welcome.bmp','header.bmp']:shutil.copy2(root.parent/'electimes-104'/name,pkg/'brand'/name)
for p in root.glob('*.nsi'):
 script=p.read_text(encoding='utf-8-sig')
 # Native Windows NSIS file searches require backslash-separated host paths.
 script=script.replace('${WORK}/brand/','${WORK}\\brand\\').replace('${WORK}/','${WORK}\\').replace('${PAYLOAD}/*','${PAYLOAD}\\*')
 (pkg/p.name).write_text(script,encoding='utf-8-sig')
for p in root.glob('*.nsh'):shutil.copy2(p,pkg/p.name)
nsis=os.environ['MAKENSIS']
output=root/'ElectimesOffice-Setup-1.0.7-x64.exe'
if os.name=='nt':
 cmd=[nsis,'/V2',f'/DWORK={pkg}',f'/DPAYLOAD={stage}',f'/DOUTPUT={output}',str(pkg/'setup-107.nsi')]
else:
 # Linux NSIS reads the unchanged host-path script.
 shutil.copy2(root/'setup-107.nsi',pkg/'setup-107.nsi')
 cmd=[nsis,'-V2',f'-DWORK={pkg}',f'-DPAYLOAD={stage}',f'-DOUTPUT={output}',str(pkg/'setup-107.nsi')]
subprocess.run(cmd,check=True)
# Inspect the built setup and compare every shipped payload byte.
extracted=root/'installer-check'
subprocess.run([seven,'x',str(output),'-o'+str(extracted),'-y'],check=True,stdout=subprocess.DEVNULL)
assert all(sha(extracted/rel)==digest for rel,digest in actual.items()),'Installer payload mismatch'
notes=['AI·메일·구글 캘린더·메모 업무패널을 정식판에 통합했습니다.','첨부파일 기본 저장 폴더를 지정하고, 탭을 바꿔도 패널 너비를 유지합니다.','좁은 창에서도 상단 메뉴를 좌우로 이동할 수 있습니다.','자동저장 스위치를 메뉴 줄로 옮겨 문서 탭 아래의 빈 줄을 제거했습니다.','DOC 재열기와 업데이트 다운로드 오류 수정은 유지됩니다.','줄바꿈 표시 및 한자 후보창 취소 문제는 이번 버전에서 해결되지 않았습니다.']
entry={'url':'https://github.com/Her-far/reporter-office-updates/releases/download/electimes-v1.0.7/'+output.name,'size':output.stat().st_size,'sha256':sha(output)}
feed={'product':'electimes-office','platform':'win32-x64','version':'1.0.7','build':107,'minBuild':103,'maxBuild':106,'notes':notes,'installer':entry,'fullInstaller':entry}
(root/'electimes-latest.json').write_text(json.dumps(feed,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(root/'ElectimesOffice-SHA256SUMS-1.0.7.txt').write_text(f'{sha(output)}  {output.name}\n')
print(json.dumps({'version':'1.0.7','payloadFilesVerified':len(actual),'installer':entry}))
