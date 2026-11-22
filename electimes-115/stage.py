"""Apply hash-checked newsroom editor changes to a clean 1.0.14 installation."""
from pathlib import Path
from hashlib import sha256
import base64,json,shutil,struct,sys
base,out=map(Path,sys.argv[1:])
if out.exists():raise SystemExit('Stage must be new')
spec=json.loads(Path(__file__).with_name('changes.json').read_text())
from menu_groups import integrate

def digest(data): return sha256(data).hexdigest()
def apply(name,data):
    patch=spec.pop(name)
    assert digest(data)==patch['before'],name
    for offset,removed,inserted in reversed(patch['edits']):
        data=data[:offset]+base64.b64decode(inserted,validate=True)+data[offset+removed:]
    assert digest(data)==patch['after'],name
    return integrate(name,data)
shutil.copytree(base,out,ignore=shutil.ignore_patterns('$PLUGINSDIR','$pluginsdir','Uninstall.exe','uninstall.exe'))
archive=out/'resources/app.asar'
data=archive.read_bytes()
header=json.loads(data[16:16+struct.unpack_from('<I',data,12)[0]])
start=8+struct.unpack_from('<I',data,4)[0]
content=bytearray()
def walk(nodes,prefix=''):
    for name,node in nodes.items():
        path=prefix+name
        if 'files' in node:
            walk(node['files'],path+'/')
        elif 'offset' in node:
            pos=start+int(node['offset'])
            buf=data[pos:pos+node['size']]
            if '@'+path in spec:
                buf=apply('@'+path,buf)
                integ=node['integrity'];span=integ['blockSize']
                integ['hash']=digest(buf);integ['blocks']=[digest(buf[i:i+span]) for i in range(0,len(buf),span)]
            node.update(offset=str(len(content)),size=len(buf));content.extend(buf)
walk(header['files'])
meta=json.dumps(header,separators=(',',':'),ensure_ascii=False).encode();aligned=(len(meta)+3)//4*4
archive.write_bytes(struct.pack('<4I',4,aligned+8,aligned+4,len(meta))+meta+bytes(aligned-len(meta))+content)
for name in list(spec):
    path=out/name;path.write_bytes(apply(name,path.read_bytes()))
assert not spec
(out/'BUILD-VERIFICATION.json').write_text(json.dumps(dict(version='1.0.15',build=115,baseVersion='1.0.14',asarSha256=digest(archive.read_bytes())),indent=2)+'\n',encoding='utf8')
