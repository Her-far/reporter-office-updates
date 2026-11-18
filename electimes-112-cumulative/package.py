"""Repackage the unchanged, published 1.0.12 payload for every supported base.

The cumulative set is the UNION of differences from all published 1.0.4–1.0.11
installers, not a widened compatibility range on the old 1.0.11-only patch.
"""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
SEVEN = os.environ.get('SEVENZIP', '7z')
RELEASES = json.loads((ROOT / 'releases.json').read_text())
TARGET = RELEASES[-1]
STAGE = ROOT / 'stage'


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def dump(name, value):
    (ROOT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def extract(exe, target):
    if target.exists():
        shutil.rmtree(target)
    subprocess.run([SEVEN, 'x', str(exe), '-o' + str(target), '-y'], check=True, stdout=subprocess.DEVNULL)


def manifest(root):
    return {p.relative_to(root).as_posix(): sha(p) for p in root.rglob('*')
            if p.is_file() and '$PLUGINSDIR' not in p.parts and p.name.lower() != 'uninstall.exe'}


def download(release):
    dest = ROOT / 'downloads' / release['name']
    dest.parent.mkdir(exist_ok=True)
    if not dest.exists():
        subprocess.run(['curl.exe' if os.name == 'nt' else 'curl', '--fail', '--location', '--retry', '3',
                        '--silent', '--show-error', '-o', str(dest), release['url']], check=True)
    assert dest.stat().st_size == release['size'], 'Installer size mismatch'
    assert sha(dest) == release['sha256'], 'Published installer checksum mismatch'
    return dest


assert [r['build'] for r in RELEASES] == list(range(104, 113))
extract(download(TARGET), STAGE)
shutil.rmtree(STAGE / '$PLUGINSDIR')
(STAGE / 'Uninstall.exe').unlink()
latest = manifest(STAGE)
dump('payload-manifest.json', latest)
changed = set()
comparisons = []
archives = ROOT / 'client-archives'
archives.mkdir(exist_ok=True)
for release in RELEASES[:-1]:
    base = ROOT / 'baseline'
    extract(download(release), base)
    version = json.loads((base / 'resources/electimes-version.json').read_text(encoding='utf-8-sig'))
    assert version == {'version': release['version'], 'build': release['build']}
    # The NSIS guard below accepts exactly the metadata emitted by these releases.
    assert (base / 'resources/electimes-version.json').read_text(encoding='utf-8') == json.dumps(version, separators=(',', ':'))
    old = manifest(base)
    delta = sorted(name for name, digest in latest.items() if old.get(name) != digest)
    changed.update(delta)
    assert old['Electimes Office.exe'] == latest['Electimes Office.exe'], 'Runtime upgrade requires a separate migration'
    shutil.copy2(base / 'resources/app.asar', archives / f"{release['build']}.asar")
    comparisons.append({'build': release['build'], 'installerSha256': release['sha256'],
                        'changedFiles': delta, 'preservedFiles': len(latest) - len(delta),
                        'olderOnlyFiles': sorted(set(old) - set(latest))})
    print(f"Compared {release['version']}: {len(delta)} changed, {len(latest)-len(delta)} preserved", flush=True)
    shutil.rmtree(base)

assert 'resources/app.asar' in changed
assert any(name.endswith('.wasm') for name in changed), 'Cumulative patch must include the previous HWP engine fixes'
assert not any(name.endswith('.dll') or name.startswith('resources/third-party-sources/') for name in changed)
payload = ROOT / 'patch-payload'
payload.mkdir(exist_ok=True)
for name in sorted(changed):
    dest = payload / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(STAGE / name, dest)
dump('comparison.json', {'target': TARGET, 'bases': comparisons, 'patchFiles': sorted(changed),
                         'verifiedPayloadFiles': len(latest)})

package = ROOT / 'package'
(package / 'brand').mkdir(parents=True, exist_ok=True)
for name in ['electimes-office.ico', 'welcome.bmp', 'header.bmp']:
    shutil.copy2(REPO / 'electimes-104' / name, package / 'brand' / name)
shutil.copy2(REPO / 'electimes-109/associations-109.nsh', package / 'associations-109.nsh')
subprocess.run(['python', str(REPO / 'electimes-109/workpanel/build/uninstall-manifest.py'),
                str(STAGE), str(package / 'uninstall-files-109.nsh')], check=True)
script = (REPO / 'electimes-109/setup-109.nsi').read_text(encoding='utf-8-sig').replace('1.0.9', '1.0.12')
start = script.index('!ifdef PATCH\nIfFileExists')
end = script.index('!endif\n!insertmacro CheckBusy', start)
guard = r'''!ifdef PATCH
IfFileExists "$INSTDIR\Electimes Office.exe" 0 wrong_base
IfFileExists "$INSTDIR\resources\app.asar" 0 wrong_base
FileOpen $0 "$INSTDIR\resources\electimes-version.json" r
IfErrors wrong_base
FileRead $0 $1
FileClose $0
'''
guard += '\n'.join("StrCmp $1 '" + json.dumps({'version': r['version'], 'build': r['build']}, separators=(',', ':')) + "' base_ok" for r in RELEASES)
guard += r'''
wrong_base:
IfSilent +2
MessageBox MB_OK|MB_ICONEXCLAMATION "이 업데이트는 전기신문 Office 1.0.4~1.0.11용입니다. 이전 버전에는 전체 설치판을 사용해 주세요."
SetErrorLevel 4
Abort
base_ok:
'''
script = script[:start] + guard + script[end:]
script = script.replace('전기신문 오피스 1.0.3~1.0.5를 1.0.12로 업데이트합니다.',
                        '전기신문 오피스 1.0.4~1.0.11을 1.0.12로 누적 업데이트합니다.')
script = script.replace('!insertmacro RegisterCompany\n!ifndef PATCH',
                        '!insertmacro RegisterCompany\nWriteUninstaller "$INSTDIR\\Uninstall.exe"\n!ifndef PATCH')
script = script.replace('WriteUninstaller "$INSTDIR\\Uninstall.exe"\nCreateDirectory', 'CreateDirectory')
if os.name == 'nt':
    script = script.replace('${WORK}/brand/', '${WORK}\\brand\\').replace('${WORK}/', '${WORK}\\').replace('${PAYLOAD}/*', '${PAYLOAD}\\*')
nsi = package / 'setup-cumulative.nsi'
nsi.write_text(script, encoding='utf-8-sig')
output = ROOT / 'ElectimesOffice-Update-1.0.12-Cumulative-x64.exe'
flag = '/' if os.name == 'nt' else '-'
subprocess.run([os.environ['MAKENSIS'], flag+'V2', flag+'DWORK='+str(package),
                flag+'DPAYLOAD='+str(payload), flag+'DOUTPUT='+str(output), flag+'DPATCH', str(nsi)], check=True)
extract(output, ROOT / 'patch-check')
actual = manifest(ROOT / 'patch-check')
assert actual == {name: latest[name] for name in sorted(changed)}, 'Patch payload differs from the published release'
assert output.stat().st_size < 60*1024*1024, 'Cumulative update is unexpectedly large'
entry = {'url': TARGET['url'].rsplit('/', 1)[0] + '/' + output.name,
         'size': output.stat().st_size, 'sha256': sha(output)}
feed = {'product': 'electimes-office', 'platform': 'win32-x64', 'version': '1.0.12', 'build': 112,
        'minBuild': 104, 'maxBuild': 111,
        'notes': ['1.0.4~1.0.11에서 중간 버전을 건너뛰어도 변경 파일만 받는 누적 업데이트를 제공합니다.',
                  'Windows 인쇄 설정창의 배율 호환성과 HWP 인쇄창 표시를 개선했습니다.',
                  '기존 HWP 붙여넣기·줄 간격·문서 재열기 및 패널 수정이 모두 포함됩니다.'],
        'installer': entry,
        'fullInstaller': {key: TARGET[key] for key in ['url', 'size', 'sha256']}}
dump('electimes-latest.json', feed)
dump('cumulative-package-windows.json', {'version': '1.0.12', 'payloadUnchanged': True, 'entry': entry,
                                       'bases': comparisons, 'patchFiles': sorted(changed),
                                       'verifiedPayloadFiles': len(latest)})
(ROOT / 'Cumulative-1.0.12-SHA256SUMS.txt').write_text(entry['sha256']+'  '+output.name+'\n', encoding='utf-8')
print(json.dumps({'entry': entry, 'files': len(changed)}), flush=True)
