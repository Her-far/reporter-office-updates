"""Restore the byte-identical, previously verified Windows candidates using the public base release."""
from pathlib import Path
import hashlib, json, os, shutil, struct, subprocess, sys, zlib

base = Path(sys.argv[1]).resolve()
def digest(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()

def verify(path, sha):
    if digest(path) != sha:
        raise ValueError(f'Unexpected SHA-256 for {path.name}')

def delta(source, patch, output):
    subprocess.run(['zstd', '-q', '-f', '-d', '--long=29', '--patch-from='+str(source),
                    str(patch), '-o', str(output)],check=True)

verify(base, '8060e3e6e89bf33aed3d3a99fa00d1ea8e85cba22d42c3bc6693b47a38604431')
streams=json.loads(Path('streams.json').read_text())
with base.open('rb') as f:
    for name in ('asar','cli'):
        old,new=Path('112-'+name+'.raw'),Path('114-'+name+'.raw')
        ref=streams['112-'+name]
        f.seek(ref['offset'])
        old.write_bytes(zlib.decompress(f.read(ref['length']),-15))
        verify(old, ref['sha256'])
        delta(old, Path(name+'.zst'), new)
        verify(new, streams['114-'+name]['sha256'])
# NSIS zlib is not byte-interchangeable with system zlib. Recreate its two large streams.
subprocess.run([os.environ.get('MAKENSIS','makensis'),'-V1','streams.nsi'],check=True)
packed=Path('newblocks.exe').read_bytes()
cursor=packed.index(b'NullsoftInst')+20
dictionary=Path('setup-dictionary')
with dictionary.open('wb') as out, base.open('rb') as src:
    shutil.copyfileobj(src,out)
    while cursor < len(packed)-4:
        size=struct.unpack_from('<I',packed,cursor)[0]&0x7fffffff
        if size in (streams['114-asar']['length'], streams['114-cli']['length']):
            out.write(packed[cursor:cursor+size+4])
        cursor+=4+size
verify(dictionary,'9bdc8a7c061cd7f79d9bd1467cef88bff29271b40aa359a1c2a62f2aa50ae170')
feed=json.loads(Path('electimes-latest.json').read_text())
setup=Path(feed['fullInstaller']['url'].split('/')[-1])
patch=Path(feed['installer']['url'].split('/')[-1])
delta(dictionary,Path('Setup.zst'),setup)
verify(setup,feed['fullInstaller']['sha256'])
layout=json.loads(Path('layout.json').read_text())
template=Path('update-template')
with setup.open('rb') as src, template.open('wb') as out:
    out.truncate(layout['length'])
    for source_pos,target_pos,length in layout['copies']:
        src.seek(source_pos);out.seek(target_pos);out.write(src.read(length))
delta(template,Path('Update.zst'),patch)
verify(patch,feed['installer']['sha256'])
for path,key in ((setup,'fullInstaller'),(patch,'installer')):
    assert path.stat().st_size==feed[key]['size']
    print(path.name, path.stat().st_size, digest(path),flush=True)
