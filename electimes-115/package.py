"""Build the Windows setup, cumulative updater and candidate feed for the staged release.
Arguments: extracted prior release, production stage, prior cumulative EXE, new output directory.
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
version = '1.0.15'
notes = ['AI와 웹 AI를 하나의 AI 메뉴에 묶었습니다. 화살표에서 문서 AI와 웹 AI를 선택합니다.',
         '기사 업무 메뉴에서 기자용 기사입력과 데스크용 기사관리를 전환합니다. 각 CMS 화면과 로그인 세션을 따로 유지합니다.',
         '홈 메뉴 전환 시 화면 위치가 움직이던 현상과 한글 눈금자의 들여쓰기 표시 및 조절을 개선했습니다.',
         '한글 본문에서 더블클릭으로 단어를 선택하는 동작을 수정했습니다.',
         'DOCX에서 선택한 본문을 문자열을 표로 기능으로 변환할 수 있도록 수정했습니다.']
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

new_build = metadata(stage)['build']
import re
assert metadata(base) == {'version':'1.0.14','build':114}
assert sha(previous_patch) == 'aeacb09ee39ebd2a15df2b6de7b0bc7c65ca7177b650be9177a081fe425dd221'
assert new_build == 115
assert metadata(stage) == {'version':version,'build':new_build}
previous_version = metadata(base)['version']
minimum_version = '1.0.6'
supported = minimum_version+'~'+previous_version
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
    associations = (prior/'associations-109.nsh').read_text('utf-8-sig')
    if new_build == 115:
        families = json.loads((repo/'electimes-114/formats.json').read_text())
        pairs = re.findall(r'FileAssociations" "\.([a-z0-9]+)" "(ElectimesOffice\.\w+)"',associations)
        assert set(dict(pairs)) == set(families)
        for ext, prog in pairs:
            before = 'Software\\Classes\\'+prog+'\\DefaultIcon" "" '
            icon = 'resources\\file-icons\\'+families[ext]+'.ico'
            assert (stage/icon.replace('\\','/')).is_file()
            lines = associations.splitlines(keepends=True)
            assert any(before in line for line in lines)
            associations = ''.join(line.replace('Electimes Office.exe',icon) if before in line else line for line in lines)
    (work/'associations-109.nsh').write_text(associations,encoding='utf-8-sig')
    subprocess.run([sys.executable, str(prior/'workpanel/build/uninstall-manifest.py'),
                    str(stage), str(work/'uninstall-files-109.nsh')],check=True)
    script = (prior/'setup-109.nsi').read_text('utf-8-sig').replace('1.0.9',version)
    start = script.index('!ifdef PATCH\nIfFileExists')
    end = script.index('!endif\n!insertmacro CheckBusy',start)
    accepted = [{'version':'1.0.'+str(i), 'build':100+i} for i in range(6,new_build-100+1)]
    guard = r'''!ifdef PATCH
IfFileExists "$INSTDIR\Electimes Office.exe" 0 wrong_base
IfFileExists "$INSTDIR\resources\app.asar" 0 wrong_base
FileOpen $0 "$INSTDIR\resources\electimes-version.json" r
IfErrors wrong_base
FileRead $0 $1
FileClose $0
'''
    guard += '\n'.join("StrCmp $1 '"+json.dumps(v,separators=(',',':'))+"' base_ok" for v in accepted)
    guard += '\nwrong_base:\nIfSilent +2\nMessageBox MB_OK|MB_ICONEXCLAMATION "전기신문 Office '+supported+' 정식판 설치 폴더를 선택하세요."\nSetErrorLevel 4\nAbort\nbase_ok:\n'
    script = script[:start] + guard + script[end:]
    script = script.replace('1.0.3~1.0.5',supported)
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
feed={'product':'electimes-office','platform':'win32-x64','version':version,'build':new_build,
      'minBuild':106,'maxBuild':new_build-1,'notes':notes,'installer':entries['Update'],'fullInstaller':entries['Setup']}
dump(output/'electimes-latest.json',feed)
(output/f'ElectimesOffice-SHA256SUMS-{version}.txt').write_text(''.join(e['sha256']+'  '+e['url'].split('/')[-1]+'\n' for e in entries.values()),encoding='utf-8')

