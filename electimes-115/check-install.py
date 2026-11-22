from pathlib import Path
import hashlib,sys
stage,*installs=map(Path,sys.argv[1:])
def sha(path):
    with path.open('rb') as f: return hashlib.file_digest(f,'sha256').hexdigest()
for p in stage.rglob('*'):
    if p.is_file():
        expected=sha(p)
        for install in installs:
            target=install/p.relative_to(stage)
            if sha(target)!=expected: raise ValueError(target)
