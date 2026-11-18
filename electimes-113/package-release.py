"""Build the Windows setup, cumulative updater and candidate feed for 1.0.13.
Arguments: extracted 1.0.12, production stage, published 1.0.12 cumulative EXE, new output directory.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory

repo = Path(__file__).resolve().parents[1]
base, stage, previous_patch, output = map(lambda a: Path(a).resolve(), sys.argv[1:])
old_feed = json.loads((repo / 'electimes-latest.json').read_text(encoding='utf-8'))
seven = os.environ.get('SEVENZIP', '7z')
compiler = os.environ.get('MAKENSIS', 'makensis')
version = '1.0.13'
notes = ['업무 패널에 웹 AI를 추가했습니다. ChatGPT, Claude, Gemini를 문서 옆에서 전환할 수 있습니다.',
         '웹 AI 도구 모음에서 넓게 버튼을 빼고 서비스 탭과 메뉴를 한 줄에 배치했습니다.',
         'Gemini 개인 Google 계정 대화에서 새 대화를 열고 현재 연결의 대화를 전환할 수 있습니다.',
         '1.0.6~1.0.12에서 누적 패치로 업데이트할 수 있습니다.']
def sha(p):
    with p.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()

def manifest(folder):
    return {p.relative_to(folder).as_posix(): sha(p) for p in folder.rglob('*')
            if p.is_file() and '$PLUGINSDIR' not in p.parts and p.name.lower() != 'uninstall.exe'}

def extract(exe, directory):
    subprocess.run([seven, 'x', str(exe), '-o'+str(directory), '-y'], check=True, stdout=subprocess.DEVNULL)

def dump(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

def metadata(directory):
    return json.loads((directory/'resources/electimes-version.json').read_text('utf-8'))

assert (old_feed['minBuild'],old_feed['maxBuild'],old_feed['build']) == (106,111,112)
assert sha(previous_patch) == old_feed['installer']['sha256'] == 'aaf4b308492a41eb4b39b4c53daf86b832528e462feae06498113fbcfb8130fa'
assert metadata(base) == {'version':'1.0.12','build':112}
assert metadata(stage) == {'version':version,'build':113}
expected = manifest(stage)
previous = manifest(base)
delta = {name for name in expected if expected[name] != previous.get(name)}
output.mkdir(parents=True, exist_ok=True)
with TemporaryDirectory(dir=output.parent) as tmp:
    work = Path(tmp)
    legacy = work/'previous-patch'
    extract(previous_patch, legacy)
    inherited = manifest(legacy)
    assert inherited and all(previous.get(n) == h and n in expected for n,h in inherited.items())
    changed = sorted(delta | inherited.keys())
    patch = work/'patch'
    for n in changed:
        dest = patch/n
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(stage/n, dest)
    brand = work/'brand'
    brand.mkdir()
    for n in ['electimes-office.ico','welcome.bmp','header.bmp']:
        shutil.copy2(repo/'electimes-104'/n,brand/n)
    prior = repo/'electimes-109'
    shutil.copy2(prior/'associations-109.nsh', work)
    subprocess.run([sys.executable, str(prior/'workpanel/build/uninstall-manifest.py'),
                    str(stage), str(work/'uninstall-files-109.nsh')],check=True)
    script = (prior/'setup-109.nsi').read_text('utf-8-sig').replace('1.0.9',version)
    start = script.index('!ifdef PATCH\nIfFileExists')
    end = script.index('!endif\n!insertmacro CheckBusy',start)
    accepted = [{'version':'1.0.'+str(i), 'build':100+i} for i in range(6,14)]
    guard = r'''!ifdef PATCH
IfFileExists "$INSTDIR\Electimes Office.exe" 0 wrong_base
IfFileExists "$INSTDIR\resources\app.asar" 0 wrong_base
FileOpen $0 "$INSTDIR\resources\electimes-version.json" r
IfErrors wrong_base
FileRead $0 $1
FileClose $0
'''
    guard += '\n'.join("StrCmp $1 '"+json.dumps(v,separators=(',',':'))+"' base_ok" for v in accepted)
    guard += '\nwrong_base:\nIfSilent +2\nMessageBox MB_OK|MB_ICONEXCLAMATION "전기신문 Office 1.0.6~1.0.12 정식판 설치 폴더를 선택하세요."\nSetErrorLevel 4\nAbort\nbase_ok:\n'
    script = script[:start] + guard + script[end:]
    script = script.replace('1.0.3~1.0.5','1.0.6~1.0.12')
    script = script.replace('WriteUninstaller "$INSTDIR\\Uninstall.exe"\n','')
    script = script.replace('!insertmacro RegisterCompany\n','!insertmacro RegisterCompany\nWriteUninstaller "$INSTDIR\\Uninstall.exe"\n')
    if os.name=='nt':
        script=script.replace('${WORK}/brand/','${WORK}\\brand\\').replace('${WORK}/','${WORK}\\').replace('${PAYLOAD}/*','${PAYLOAD}\\*')
    nsi = work/'setup.nsi'
    nsi.write_text(script,encoding='utf-8-sig')
    entries = {}
    flag = '/' if os.name=='nt' else '-'
    for kind,payload,names in [('Update',patch,changed),('Setup',stage,expected)]:
        exe = output/f'ElectimesOffice-{kind}-{version}-x64.exe'
        args=[compiler,flag+'V2',flag+'DWORK='+str(work),flag+'DPAYLOAD='+str(payload),flag+'DOUTPUT='+str(exe)]
        if kind=='Update': args.append(flag+'DPATCH')
        subprocess.run(args+[str(nsi)],check=True)
        check = work/(kind+'-check')
        extract(exe,check)
        assert manifest(check) == {n:expected[n] for n in names}
        entries[kind]={'url':f'https://github.com/Her-far/reporter-office-updates/releases/download/electimes-v{version}/{exe.name}',
                       'size':exe.stat().st_size,'sha256':sha(exe)}
        print(kind,len(names),'files',exe.stat().st_size,'bytes verified',flush=True)
feed={'product':'electimes-office','platform':'win32-x64','version':version,'build':113,
      'minBuild':106,'maxBuild':112,'notes':notes,'installer':entries['Update'],'fullInstaller':entries['Setup']}
dump(output/'electimes-latest.json',feed)
(output/f'ElectimesOffice-SHA256SUMS-{version}.txt').write_text(''.join(e['sha256']+'  '+e['url'].split('/')[-1]+'\n' for e in entries.values()),encoding='utf-8')
