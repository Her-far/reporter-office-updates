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
output=root/'ElectimesOffice-Setup-1.0.9-x64.exe'
if os.name=='nt':
 cmd=[nsis,'/V2',f'/DWORK={pkg}',f'/DPAYLOAD={stage}',f'/DOUTPUT={output}',str(pkg/'setup-109.nsi')]
else:
 # Linux NSIS reads the unchanged host-path script.
 shutil.copy2(root/'setup-109.nsi',pkg/'setup-109.nsi')
 cmd=[nsis,'-V2',f'-DWORK={pkg}',f'-DPAYLOAD={stage}',f'-DOUTPUT={output}',str(pkg/'setup-109.nsi')]
subprocess.run(cmd,check=True)
# Inspect the built setup and compare every shipped payload byte.
extracted=root/'installer-check'
subprocess.run([seven,'x',str(output),'-o'+str(extracted),'-y'],check=True,stdout=subprocess.DEVNULL)
mismatched=[rel for rel,digest in actual.items() if not (extracted/rel).is_file() or sha(extracted/rel)!=digest]
assert not mismatched,'Installer payload mismatch: '+json.dumps(mismatched)
notes=['다운로드가 끝나도 종료하지 않고 재시작 버튼을 누를 때까지 기다립니다.', '이미 받은 업데이트 파일을 재사용할 때도 자동 종료하지 않습니다.', 'AI 패널 접기·다시 열기와 왼쪽·오른쪽 이동을 수정했습니다.', '찾기 창을 닫은 뒤 바로 화살표 이동 및 키보드 편집이 가능합니다.', '본문 첨부파일 링크를 지정한 다운로드 폴더에 저장할 수 있습니다.', 'HWP 표 잘림과 긴 본문 드래그 선택을 개선했습니다.', '기존 계정 연결·문서·메모와 DOC 재열기 개선을 유지합니다.']
entry={'url':'https://github.com/Her-far/reporter-office-updates/releases/download/electimes-v1.0.9/'+output.name,'size':output.stat().st_size,'sha256':sha(output)}
feed={'product':'electimes-office','platform':'win32-x64','version':'1.0.9','build':109,'minBuild':103,'maxBuild':108,'notes':notes,'installer':entry,'fullInstaller':entry}
(root/'electimes-latest.json').write_text(json.dumps(feed,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(root/'ElectimesOffice-SHA256SUMS-1.0.9.txt').write_text(f'{sha(output)}  {output.name}\n')
print(json.dumps({'version':'1.0.9','payloadFilesVerified':len(actual),'installer':entry}))
