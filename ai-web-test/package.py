from pathlib import Path
import hashlib,json,os,shutil,subprocess
root=Path(__file__).resolve().parent
stage=root/'stage';base=root/'base';package=root/'package';dist=root/'dist'
package.mkdir(exist_ok=True);dist.mkdir(exist_ok=True)
def sha(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def manifest(folder):
 return {p.relative_to(folder).as_posix():sha(p) for p in folder.rglob('*') if p.is_file() and '$PLUGINSDIR' not in p.parts and p.name.lower()!='uninstall.exe'}
target=manifest(stage);original=manifest(base)
(package/'base-manifest.json').write_text(json.dumps(original),encoding='utf-8')
(dist/'payload-manifest.json').write_text(json.dumps(target),encoding='utf-8')
shutil.copy2(root/'copy-base.ps1',package/'copy-base.ps1')
shutil.copy2(root.parent/'electimes-104/electimes-office.ico',package/'electimes-office.ico')
subprocess.run(['python',str(root.parent/'electimes-109/workpanel/build/uninstall-manifest.py'),str(stage),str(package/'uninstall-files.nsh')],check=True)
compact=root/'package/compact';compact.mkdir(exist_ok=True)
changed=[]
for name,digest in target.items():
 old='Electimes Office.exe' if name=='ElectimesOffice-AIWeb-Test.exe' else name
 if original.get(old)==digest:continue
 changed.append(name);dest=compact/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(stage/name,dest)
assert 'ElectimesOffice-AIWeb-Test.exe' not in changed
assert not any(p.endswith('.wasm') for p in changed)
artifacts=[]
for kind,payload in [('Compact',compact),('Full',stage)]:
 exe=dist/f'ElectimesOffice-AIWeb-Test-1.0.12.1-{kind}-Setup.exe'
 args=[os.environ['MAKENSIS'],'/V2','/DPACKAGE='+str(package),'/DPAYLOAD='+str(payload),'/DOUTPUT='+str(exe)]
 if kind=='Compact':args+=['/DCOMPACT']
 subprocess.run(args+[str(root/'setup.nsi')],check=True)
 artifacts.append({'name':exe.name,'size':exe.stat().st_size,'sha256':sha(exe)})
assert artifacts[0]['size']<30*1024*1024
(dist/'SHA256SUMS.txt').write_text(''.join(x['sha256']+'  '+x['name']+'\n' for x in artifacts))
(dist/'package-windows.json').write_text(json.dumps({'version':'1.0.12-aiweb.1','files':len(target),'compactFiles':changed,'artifacts':artifacts},indent=2))
shutil.copy2(stage/'BUILD-VERIFICATION.json',dist/'BUILD-VERIFICATION.json')
print(json.dumps(artifacts),flush=True)
