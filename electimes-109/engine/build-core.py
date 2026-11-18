"""Rebuild the pinned shipping engine, retaining GenOffice's vendor patches."""
from pathlib import Path
import hashlib,json,os,shutil,subprocess,sys
root=Path(__file__).resolve().parent
work=Path(sys.argv[1]).resolve();out=Path(sys.argv[2]).resolve()
RHWP='1a76570e833917d15817415a53c09ad61ab3203f'
VENDOR='4e4e9cc2d6b69c60cbd33ce237539f65f8016cca'
def run(args,cwd=None,**kwargs):return subprocess.run(args,cwd=cwd,check=True,**kwargs)
def checkout(url,commit,dest,paths):
 if not (dest/'.git').exists():
  dest.mkdir(parents=True,exist_ok=True)
  run(['git','init',str(dest)])
  run(['git','-C',str(dest),'remote','add','origin',url])
  run(['git','-C',str(dest),'config','remote.origin.promisor','true'])
  run(['git','-C',str(dest),'config','remote.origin.partialclonefilter','blob:none'])
  run(['git','-C',str(dest),'fetch','--filter=blob:none','--depth','1','origin',commit])
  run(['git','-C',str(dest),'sparse-checkout','set',*paths])
  run(['git','-C',str(dest),'checkout','--detach',commit])
 actual=subprocess.check_output(['git','-C',str(dest),'rev-parse','HEAD'],text=True).strip()
 assert actual==commit,actual
work.mkdir(parents=True,exist_ok=True)
source=work/'rhwp';vendor=work/'genoffice'
checkout('https://github.com/edwardkim/rhwp.git',RHWP,source,['src','crates','assets','saved','data','vendor','tools','bindings','scripts','mydocs/manual','mydocs/tech/agent_roadmap'])
checkout('https://github.com/pblsketch/openoffice.git',VENDOR,vendor,['vendor/rhwp-core'])
manifest=json.loads((vendor/'vendor/rhwp-core/package.json').read_text())
assert manifest['rhwp']['commit']==RHWP
for patch in manifest['rhwp']['patches']:
 run(['git','apply','--whitespace=nowarn',str(vendor/'vendor/rhwp-core/patches'/patch)],cwd=source)
run([sys.executable,str(root/'apply-table-zones.py'),str(source)])
env={**os.environ,'CARGO_BUILD_JOBS':'2','RUSTFLAGS':f'--remap-path-prefix={Path.home()/".cargo"}=/cargo --remap-path-prefix={source}=/rhwp'}
run(['cargo','build','--release','--locked','--lib','--target','wasm32-unknown-unknown'],cwd=source,env=env)
out.mkdir(parents=True,exist_ok=True)
run([os.environ.get('WASM_BINDGEN','wasm-bindgen'),str(source/'target/wasm32-unknown-unknown/release/rhwp.wasm'),'--target','web','--out-dir',str(out)])
for name in ['LICENSE','THIRD_PARTY_LICENSES.md']:shutil.copy2(source/name,out/name)
patchdest=out/'source-patches';patchdest.mkdir(exist_ok=True)
for patch in manifest['rhwp']['patches']:shutil.copy2(vendor/'vendor/rhwp-core/patches'/patch,patchdest/patch)
shutil.copy2(root/'apply-table-zones.py',patchdest/'apply-table-zones.py')
record={'rhwpCommit':RHWP,'genofficeCommit':VENDOR,'vendorPatches':manifest['rhwp']['patches'],'additionalPatch':'apply-table-zones.py','rust':'1.93.1','wasmBindgen':'0.2.127','sha256':hashlib.sha256((out/'rhwp_bg.wasm').read_bytes()).hexdigest()}
(out/'build-manifest.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record))
