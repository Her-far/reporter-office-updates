import pathlib, sys
root=pathlib.Path(sys.argv[1]).resolve()
out=pathlib.Path(sys.argv[2])
def quote(p):
    return str(p).replace('\\','/').replace('$','$$').replace('"','$\\"').replace('/','\\')
files=sorted(p for p in root.rglob('*') if p.is_file())
dirs=sorted((p for p in root.rglob('*') if p.is_dir()),key=lambda p:len(p.parts),reverse=True)
out.write_text('\n'.join(['Delete "$INSTDIR\\'+quote(p.relative_to(root))+'"' for p in files]+['RMDir "$INSTDIR\\'+quote(p.relative_to(root))+'"' for p in dirs])+'\n',encoding='utf-8')
