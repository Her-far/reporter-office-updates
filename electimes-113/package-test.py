"""Package a 1.0.13 TEST full installer from a verified stage built by build.cjs.

Usage: python package-test.py <stage> <label, e.g. test.1> <output-dir>
Environment: MAKENSIS (makensis), SEVENZIP (7z).

Only a full installer is made. It is not a release asset and no update feed is
written; the published 1.0.12 release and feed are unchanged. It installs into
the normal folder over 1.0.12 (documents and settings are kept). Installing the
published 1.0.12 full installer again returns to 1.0.12.
"""
from pathlib import Path
import hashlib, json, os, re, shutil, subprocess, sys

here = Path(__file__).resolve().parent
repo = here.parent
stage, label, out = Path(sys.argv[1]).resolve(), sys.argv[2], Path(sys.argv[3]).resolve()
if not re.fullmatch(r'test\.\d{1,3}', label): sys.exit('Label must look like test.1')
version = '1.0.13-' + label
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()

meta = json.loads((stage / 'resources/electimes-version.json').read_text())
if meta != {'version': version, 'build': 113}: sys.exit(f'Stage is not {version}: {meta}')
verification = json.loads((stage / 'BUILD-VERIFICATION.json').read_text())
if verification.get('version') != version: sys.exit('Stage verification report does not match')
manifest = {p.relative_to(stage).as_posix(): sha(p) for p in sorted(stage.rglob('*')) if p.is_file()}

out.mkdir(parents=True, exist_ok=True)
work = out / 'package'; shutil.rmtree(work, ignore_errors=True); (work / 'brand').mkdir(parents=True)
for name in ['electimes-office.ico', 'welcome.bmp', 'header.bmp']: shutil.copy2(repo / 'electimes-104' / name, work / 'brand' / name)
shutil.copy2(repo / 'electimes-109/associations-109.nsh', work / 'associations-109.nsh')
subprocess.run([sys.executable, str(repo / 'electimes-109/workpanel/build/uninstall-manifest.py'), str(stage), str(work / 'uninstall-files-109.nsh')], check=True)

script = (repo / 'electimes-109/setup-109.nsi').read_text(encoding='utf-8-sig')
def exact(s, a, b):
    if s.count(a) != 1: sys.exit('Unexpected installer anchor: ' + a[:70])
    return s.replace(a, b)
script = exact(script, 'VIProductVersion "1.0.9.0"', 'VIProductVersion "1.0.13.0"')
script = exact(script, 'VIAddVersionKey "FileDescription" "전기신문 오피스 설치 및 업데이트"', 'VIAddVersionKey "FileDescription" "전기신문 오피스 시험판 설치"')
script = exact(script, '"전기신문 오피스 1.0.9를 설치합니다.$\\r$\\n$\\r$\\n',
               f'"전기신문 오피스 {version}(시험판)을 설치합니다. 업무 패널의 웹 AI(ChatGPT·Claude·Gemini)를 시험합니다.$\\r$\\n$\\r$\\n')
# A test package is never a patch; drop the patch-only base check.
start = script.index('!ifdef PATCH\nIfFileExists'); end = script.index('!endif\n!insertmacro CheckBusy', start)
script = script[:start] + script[end + len('!endif\n'):]
script = script.replace('1.0.9', version)
if os.name == 'nt': script = script.replace('${WORK}/brand/', '${WORK}\\brand\\').replace('${WORK}/', '${WORK}\\').replace('${PAYLOAD}/*', '${PAYLOAD}\\*')
nsi = work / 'setup-113-test.nsi'; nsi.write_text(script, encoding='utf-8-sig')

exe = out / f'ElectimesOffice-Setup-{version}-x64.exe'
flag = '/' if os.name == 'nt' else '-'
subprocess.run([os.environ.get('MAKENSIS', 'makensis'), flag + 'V2', flag + 'DWORK=' + str(work), flag + 'DPAYLOAD=' + str(stage), flag + 'DOUTPUT=' + str(exe), str(nsi)], check=True)

# The installer must contain exactly the verified stage.
check = out / 'installer-check'; shutil.rmtree(check, ignore_errors=True)
subprocess.run([os.environ.get('SEVENZIP', '7z'), 'x', str(exe), '-o' + str(check), '-y'], check=True, stdout=subprocess.DEVNULL)
bad = [n for n, d in manifest.items() if not (check / n).is_file() or sha(check / n) != d]
if bad: sys.exit('Installer payload mismatch: ' + ', '.join(bad[:5]))
shutil.rmtree(check)
(out / 'payload-manifest.json').write_text(json.dumps(manifest))
digest = sha(exe)
(out / f'ElectimesOffice-SHA256SUMS-{version}.txt').write_text(f'{digest}  {exe.name}\n')
info = {'version': version, 'build': 113, 'installer': exe.name, 'size': exe.stat().st_size, 'sha256': digest,
        'payloadFiles': len(manifest), 'asarSha256': verification.get('asarSha256'), 'base': '1.0.12 (8060e3e6…04431)'}
(out / 'package-test.json').write_text(json.dumps(info, indent=2, ensure_ascii=False))
print(json.dumps(info, ensure_ascii=False))
