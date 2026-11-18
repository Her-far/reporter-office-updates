from pathlib import Path
import hashlib,json,os,shutil,subprocess,sys
root=Path(__file__).resolve().parent;stage=root/'stage';previous=root.parent/'electimes-109'
sha=lambda p:hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
seven=os.environ.get('SEVENZIP','7z')
if '--stage-only' in sys.argv:
 assert sha(root/'base.exe')=='91a7b5b39254c8345588cfefb28d386a96c882bdeec352edd8aaf6a0040e066e','Published 1.0.10 mismatch'
 subprocess.run([seven,'x',str(root/'base.exe'),'-o'+str(root/'base-installer'),'-y'],check=True,stdout=subprocess.DEVNULL)
 subprocess.run(['node',str(root/'build.cjs'),str(root/'base-installer'),str(stage)],check=True)
 manifest={p.relative_to(stage).as_posix():sha(p) for p in stage.rglob('*') if p.is_file()}
 (root/'payload-manifest.json').write_text(json.dumps(manifest));sys.exit(0)
manifest=json.loads((root/'payload-manifest.json').read_text())
assert manifest=={p.relative_to(stage).as_posix():sha(p) for p in stage.rglob('*') if p.is_file()},'Payload changed during native validation'
package=root/'package';(package/'brand').mkdir(parents=True,exist_ok=True)
for name in ['electimes-office.ico','welcome.bmp','header.bmp']:shutil.copy2(root.parent/'electimes-104'/name,package/'brand'/name)
# Preserve file associations; regenerate uninstall inventory including the new source patch.
shutil.copy2(previous/'associations-109.nsh',package/'associations-109.nsh')
subprocess.run([sys.executable,str(previous/'workpanel/build/uninstall-manifest.py'),str(stage),str(package/'uninstall-files-109.nsh')],check=True)
script=(previous/'setup-109.nsi').read_text(encoding='utf-8-sig').replace('1.0.9','1.0.11')
if os.name=='nt':script=script.replace('${WORK}/brand/','${WORK}\\brand\\').replace('${WORK}/','${WORK}\\').replace('${PAYLOAD}/*','${PAYLOAD}\\*')
target_script=package/'setup-111.nsi';target_script.write_text(script,encoding='utf-8-sig')
output=root/'ElectimesOffice-Setup-1.0.11-x64.exe';flag='/' if os.name=='nt' else '-'
subprocess.run([os.environ['MAKENSIS'],flag+'V2',flag+'DWORK='+str(package),flag+'DPAYLOAD='+str(stage),flag+'DOUTPUT='+str(output),str(target_script)],check=True)
check=root/'installer-check';subprocess.run([seven,'x',str(output),'-o'+str(check),'-y'],check=True,stdout=subprocess.DEVNULL)
assert all((check/p).is_file() and sha(check/p)==digest for p,digest in manifest.items()),'Installer content mismatch'
entry={'url':'https://github.com/Her-far/reporter-office-updates/releases/download/electimes-v1.0.11/'+output.name,'size':output.stat().st_size,'sha256':sha(output)}
feed={'product':'electimes-office','platform':'win32-x64','version':'1.0.11','build':111,'minBuild':103,'maxBuild':110,'notes':['HWP 표 안에서 긴 글을 붙여넣은 뒤 아래 문단과 겹치는 문제를 수정했습니다.','잘라내기·범위 삭제 후 남은 문단의 위치를 다시 계산합니다.','중첩 표의 서식 있는 붙여넣기에도 같은 수정을 적용했습니다.','빈 줄 삭제 시 본문 줄 간격을 유지하고 실행 취소 시 원래 서식을 복원합니다.','1.0.10 패널 수정을 유지합니다.'],'installer':entry,'fullInstaller':entry}
(root/'electimes-latest.json').write_text(json.dumps(feed,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(root/'ElectimesOffice-SHA256SUMS-1.0.11.txt').write_text(f'{sha(output)}  {output.name}\n')
print(json.dumps({'version':'1.0.11','payloadFilesVerified':len(manifest),'installer':entry}))
