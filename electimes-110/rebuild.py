from pathlib import Path
import hashlib,json,os,shutil,subprocess,sys
root=Path(__file__).resolve().parent;stage=root/'stage';previous=root.parent/'electimes-109'
sha=lambda p:hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
seven=os.environ.get('SEVENZIP','7z')
if '--stage-only' in sys.argv:
 assert sha(root/'base.exe')=='238ee7afbf096e8725cb7d7c9409f5b74f7cf45f6c5c42377233669296ba4483','Published 1.0.9 mismatch'
 subprocess.run([seven,'x',str(root/'base.exe'),'-o'+str(root/'base-installer'),'-y'],check=True,stdout=subprocess.DEVNULL)
 subprocess.run(['node',str(root/'build.cjs'),str(root/'base-installer'),str(stage)],check=True)
 manifest={p.relative_to(stage).as_posix():sha(p) for p in stage.rglob('*') if p.is_file()}
 (root/'payload-manifest.json').write_text(json.dumps(manifest));sys.exit(0)
manifest=json.loads((root/'payload-manifest.json').read_text())
assert manifest=={p.relative_to(stage).as_posix():sha(p) for p in stage.rglob('*') if p.is_file()},'Payload changed during native validation'
package=root/'package';(package/'brand').mkdir(parents=True,exist_ok=True)
for name in ['electimes-office.ico','welcome.bmp','header.bmp']:shutil.copy2(root.parent/'electimes-104'/name,package/'brand'/name)
# File inventory and associations are unchanged from the verified full installer.
for name in ['associations-109.nsh','uninstall-files-109.nsh']:shutil.copy2(previous/name,package/name)
script=(previous/'setup-109.nsi').read_text(encoding='utf-8-sig').replace('1.0.9','1.0.10')
if os.name=='nt':script=script.replace('${WORK}/brand/','${WORK}\\brand\\').replace('${WORK}/','${WORK}\\').replace('${PAYLOAD}/*','${PAYLOAD}\\*')
target_script=package/'setup-110.nsi';target_script.write_text(script,encoding='utf-8-sig')
output=root/'ElectimesOffice-Setup-1.0.10-x64.exe';flag='/' if os.name=='nt' else '-'
subprocess.run([os.environ['MAKENSIS'],flag+'V2',flag+'DWORK='+str(package),flag+'DPAYLOAD='+str(stage),flag+'DOUTPUT='+str(output),str(target_script)],check=True)
check=root/'installer-check';subprocess.run([seven,'x',str(output),'-o'+str(check),'-y'],check=True,stdout=subprocess.DEVNULL)
assert all((check/p).is_file() and sha(check/p)==digest for p,digest in manifest.items()),'Installer content mismatch'
entry={'url':'https://github.com/Her-far/reporter-office-updates/releases/download/electimes-v1.0.10/'+output.name,'size':output.stat().st_size,'sha256':sha(output)}
feed={'product':'electimes-office','platform':'win32-x64','version':'1.0.10','build':110,'minBuild':103,'maxBuild':109,'notes':['홈 화면에서도 설정한 패널 위치를 적용합니다.','확대 화면에 패널로 돌아가기 버튼을 표시하고 Esc로 복원합니다.','홈 화면의 확대 패널이 문서 탭과 창 조작 버튼을 가리지 않도록 수정했습니다.','기존 패널 너비와 작성 중인 메모를 유지합니다.'],'installer':entry,'fullInstaller':entry}
(root/'electimes-latest.json').write_text(json.dumps(feed,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(root/'ElectimesOffice-SHA256SUMS-1.0.10.txt').write_text(f'{sha(output)}  {output.name}\n')
print(json.dumps({'version':'1.0.10','payloadFilesVerified':len(manifest),'installer':entry}))
