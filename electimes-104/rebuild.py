from pathlib import Path
import base64,hashlib,json,os,shutil,struct,subprocess,zipfile
root=Path.cwd();stage=root/'stage';pkg=root/'package';pkg.mkdir(exist_ok=True)
sha=lambda p:hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
# The compiled overlay is a verified ZIP; no user documents are included.
z=zipfile.ZipFile(root/'overlay.zip');manifest=json.loads(z.read('manifest.json'))
assert sha(root/'base.exe')==manifest['baseInstallerSha256'],'Published base mismatch'
seven=os.environ.get('SEVENZIP','7z')
subprocess.run([seven,'x',str(root/'base.exe'),'-o'+str(root/'base-installer'),'-y'],check=True,stdout=subprocess.DEVNULL)
archive=next((root/'base-installer').rglob('program.7z'))
subprocess.run([seven,'x',str(archive),'-o'+str(stage),'-y'],check=True,stdout=subprocess.DEVNULL)
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
(pkg/'brand').mkdir(exist_ok=True)
for name in ['electimes-office.ico','welcome.bmp','header.bmp']:shutil.copy2(root/name,pkg/'brand'/name)
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
 cmd=[nsis,'/V2',f'/DWORK={pkg}',f'/DPAYLOAD={payload}',f'/DOUTPUT={root / ("ElectimesOffice-"+kind+"-1.0.4-x64.exe")}']
 if kind=='Update':cmd+=['/DPATCH']
 subprocess.run(cmd+[str(pkg/'setup-104.nsi')],check=True)
notes=['스크롤할 때 이미 읽은 셀을 반복해서 지우고 다시 채우던 처리를 줄였습니다.','문서를 연 뒤 남던 파란 점선과 홈 로고 겹침을 수정하고 Office 표기를 적용했습니다.','업데이트 알림을 추가했습니다. 설정에서 끄거나 직접 업데이트를 확인할 수 있습니다.','Windows 기본 앱 목록 등록을 지원합니다. 설치판은 별도의 압축 해제 스크립트 없이 설치합니다.']
url='https://github.com/Her-far/reporter-office-updates/releases/download/electimes-v1.0.4/'
entry=lambda p:{'url':url+p.name,'size':p.stat().st_size,'sha256':sha(p)}
feed={'product':'electimes-office','platform':'win32-x64','version':'1.0.4','build':104,'minBuild':103,'maxBuild':103,'notes':notes,'installer':entry(root/'ElectimesOffice-Update-1.0.4-x64.exe'),'fullInstaller':entry(root/'ElectimesOffice-Setup-1.0.4-x64.exe')}
(root/'electimes-latest.json').write_text(json.dumps(feed,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(root/'ElectimesOffice-SHA256SUMS-1.0.4.txt').write_text('\n'.join(f'{sha(p)}  {p.name}' for p in sorted(root.glob('*.exe')) if p.name!='base.exe')+'\n')
print(json.dumps({'version':'1.0.4','payloadFilesVerified':len(actual),'patch':feed['installer'],'full':feed['fullInstaller']}))
