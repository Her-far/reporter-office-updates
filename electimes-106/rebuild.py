from pathlib import Path
import base64,hashlib,json,os,shutil,struct,subprocess,sys,zipfile
root=Path.cwd();stage=root/'stage';pkg=root/'package';pkg.mkdir(exist_ok=True)
sha=lambda p:hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
# The compiled overlay is a verified ZIP; no user documents are included.
(root/'overlay.zip').write_bytes(base64.b64decode(''.join(p.read_text() for p in sorted(root.glob('overlay-*.b64')))))
z=zipfile.ZipFile(root/'overlay.zip');manifest=json.loads(z.read('manifest.json'))
assert sha(root/'base.exe')==manifest['baseInstallerSha256'],'Published base mismatch'
seven=os.environ.get('SEVENZIP','7z')
subprocess.run([seven,'x',str(root/'base.exe'),'-o'+str(root/'base-installer'),'-y'],check=True,stdout=subprocess.DEVNULL)
stage.mkdir(exist_ok=True)
for rel in manifest['expected']:
 p=root/'base-installer'/rel;q=stage/rel
 if p.exists():q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q)
for item in manifest['files']:
 p=stage/item['path'];data=z.read(item['payload'])
 if item['before']:
  assert sha(p)==item['before'],item['path']
  old=p.read_bytes();assert data[:4]==b'ETR1';pos=4;chunks=[]
  while pos<len(data):
   tag=data[pos:pos+1];pos+=1
   if tag==b'C':at,n=struct.unpack_from('<QI',data,pos);pos+=12;chunks.append(old[at:at+n])
   else:
    assert tag==b'D';n=struct.unpack_from('<I',data,pos)[0];pos+=4;chunks.append(data[pos:pos+n]);pos+=n
  data=b''.join(chunks)
 assert hashlib.sha256(data).hexdigest()==item['after'],item['path']
 p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
for rel in manifest['delete']:(stage/rel).unlink()
for p in sorted(stage.rglob('*'),key=lambda p:len(p.parts),reverse=True):
 if p.is_dir() and not any(p.iterdir()):p.rmdir()
actual={p.relative_to(stage).as_posix():sha(p) for p in stage.rglob('*') if p.is_file()}
assert actual==manifest['expected'],'Payload integrity mismatch'
if '--stage-only' in sys.argv:
 print(json.dumps({'stageVerified':len(actual)}));sys.exit(0)
(pkg/'brand').mkdir(exist_ok=True)
for name in ['electimes-office.ico','welcome.bmp','header.bmp']:shutil.copy2(root.parent/'electimes-104'/name,pkg/'brand'/name)
for p in root.glob('*.nsi'):
 script=p.read_text(encoding='utf-8-sig')
 # Native Windows NSIS file searches require backslash-separated host paths.
 script=script.replace('${WORK}/brand/','${WORK}\\brand\\').replace('${WORK}/','${WORK}\\').replace('${PAYLOAD}/*','${PAYLOAD}\\*')
 (pkg/p.name).write_text(script,encoding='utf-8-sig')
for p in root.glob('*.nsh'):shutil.copy2(p,pkg/p.name)
patch=root/'patch'
for rel in manifest['patchFiles']:
 p=patch/rel;p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(stage/rel,p)
nsis=os.environ['MAKENSIS']
for kind,payload in [('Setup',stage),('Update',patch)]:
 cmd=[nsis,'/V2',f'/DWORK={pkg}',f'/DPAYLOAD={payload}',f'/DOUTPUT={root / ("ElectimesOffice-"+kind+"-1.0.6-x64.exe")}']
 if kind=='Update':cmd+=['/DPATCH']
 subprocess.run(cmd+[str(pkg/'setup-106.nsi')],check=True)
notes=['업데이트 다운로드 중 Redirect was cancelled 오류를 수정했습니다.','1.0.5 이하에서 업데이트가 안 되면 이번 설치 파일을 직접 실행해 주세요.','다운로드 취소·재시도와 파일 크기·SHA-256 검증을 확인했습니다.']
url='https://github.com/Her-far/reporter-office-updates/releases/download/electimes-v1.0.6/'
entry=lambda p:{'url':url+p.name,'size':p.stat().st_size,'sha256':sha(p)}
feed={'product':'electimes-office','platform':'win32-x64','version':'1.0.6','build':106,'minBuild':103,'maxBuild':105,'notes':notes,'installer':entry(root/'ElectimesOffice-Update-1.0.6-x64.exe'),'fullInstaller':entry(root/'ElectimesOffice-Setup-1.0.6-x64.exe')}
(root/'electimes-latest.json').write_text(json.dumps(feed,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(root/'ElectimesOffice-SHA256SUMS-1.0.6.txt').write_text('\n'.join(f'{sha(p)}  {p.name}' for p in sorted(root.glob('*.exe')) if p.name!='base.exe')+'\n')
print(json.dumps({'version':'1.0.6','payloadFilesVerified':len(actual),'patch':feed['installer'],'full':feed['fullInstaller']}))
