"""Generate the home SVGs and multi-resolution Windows icons from the same drawing."""
import io
import json
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET

from PIL import Image

here = Path(__file__).resolve().parent
resources, output = map(Path, sys.argv[1:])
svg_dir, ico_dir = output / "svg", output / "ico"
for directory in (svg_dir, ico_dir):
    directory.mkdir(parents=True, exist_ok=True)

# Take the visible brand path from the production vector, retaining its proportions.
emblem = ET.parse(resources / 'electimes-emblem.svg').find(
    ".//{http://www.w3.org/2000/svg}path[@transform='matrix(1,0,0,-1,6.220215,37.613557)']")
if emblem is None:
    raise ValueError('Expected the Electimes emblem from 1.0.13')
brand = f'<g transform="translate(33 39) scale(.308)"><path transform="{emblem.get("transform")}" d="{emblem.get("d")}" fill="#13326b"/></g>'
navy = '#19345d'
def stroke(d, width=3):
    return f'<path d="{d}" fill="none" stroke="currentColor" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"/>'

def dot(x, y, r):
    return f'<circle cx="{x}" cy="{y}" r="{r}"/>'

def square(x, y):
    return f'<rect x="{x}" y="{y}" width="7" height="7" rx="1.4"/>'

grid = ''.join(square(x, y) for x in (20, 29) for y in (15, 24))
pdf = stroke('M19 29V16h3c5 0 5 6 0 6h-3 M28 29V16h2c6 0 6 13 0 13z M39 29V16h6m-6 6h5', 2.5)
styles = {
    'hwp': ('#267da9', stroke('M20 16h9c0 6-3 11-9 15 M35 14v18m0-10h4', 3.5)),
    'docx': ('#505ec1', stroke('M20 17h15m-15 6h19m-19 6h13', 3.3)),
    'xlsx': ('#21856f', grid),
    'csv': ('#21856f', stroke('M20 17h6m5 0h6m-17 6h6m5 0h6m-17 6h6m6-1-2 4', 2.7)),
    'tsv': ('#21856f', stroke('M20 16v14m4-7h12m-4-4 4 4-4 4m7-11v14', 2.7)),
    'pptx': ('#bd6827', stroke('M19 16h21m-19 0v12h17V16m-9 12v3m-4 3 4-3 4 3', 2.7)),
    'md': ('#475469', stroke('M26 15l-3 16m11-16-3 16m-11-11h17m-18 6h17', 3)),
    'html': ('#8051ae', stroke('m25 17-6 6 6 6m9-12 6 6-6 6m-3-14-4 17', 2.7)),
    'xmind': ('#b14780', stroke('m23 23 12-7m-12 7 12 7', 2.6) + dot(23,23,3.5) + dot(35,16,3.3) + dot(35,30,3.3)),
    'pdf': ('#bc4055', pdf),
    'txt': ('#516372', stroke('M20 17h18m-18 6h18m-18 6h10', 2.4)),
    'json': ('#7256a0', stroke('M25 15h-2q-2 0-2 3v2q0 3-3 3 3 0 3 3v2q0 3 2 3h2m8-16h2q2 0 2 3v2q0 3 3 3-3 0-3 3v2q0 3-2 3h-2', 2.6)),
    'epub': ('#87702f', stroke('M29 18q-4-4-10-3v14q6-1 10 3 4-4 10-3V15q-6-1-10 3zm0 0v14', 2.5))
}
page = 'M12 3h29l14 14v40q0 4-4 4H12q-4 0-4-4V7q0-4 4-4Z'
def document(color, glyph):
    return (f'<path d="{page}" fill="white"/><path d="M14 4H12q-3 0-3 3v50q0 3 3 3h2Z" fill="{color}"/>'
            f'<path d="M41 3v11q0 3 3 3h11" fill="#e2e9f1" stroke="{navy}" stroke-width="2.1" stroke-linejoin="round"/>'
            f'<path d="{page}" fill="none" stroke="{navy}" stroke-width="2.6" stroke-linejoin="round"/>'
            f'<g color="{color}" fill="{color}">{glyph}</g>{brand}')

icons = {k: document(*v) for k, v in styles.items()}
icons['pdf-tools'] = document(styles['pdf'][0], stroke('M20 15h10v12H20z M25 28v4h12V20h-5', 2.8))
icons['folder'] = ('<g stroke="#19345d" stroke-width="2.6" stroke-linejoin="round">'
                   '<path d="M6 48V16q0-3 3-3h15l5 6h24q4 0 4 4v23Z" fill="#b7c9dc"/>'
                   '<path d="M6 49l5-22q.5-3 4-3h43l-5 25q-.5 3-4 3H10q-4 0-4-3Z" fill="#f8fbff"/></g>'
                   +brand.replace('33 39','32 29'))
registered = set(json.loads((here/'formats.json').read_text()).values())
assert registered == styles.keys()
for name, drawing in icons.items():
    svg = svg_dir / f'{name}.svg'
    svg.write_text('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">'
                   + drawing + '</svg>\n', encoding='utf-8')
    if name in registered:
        raster = subprocess.check_output(['inkscape', str(svg), '--export-type=png',
                                          '--export-width=768', '--export-filename=-'])
        image = Image.open(io.BytesIO(raster)).convert('RGBA').resize((256,256), Image.Resampling.LANCZOS)
        image.save(ico_dir/f'{name}.ico', sizes=[(n,n) for n in (16,20,24,32,40,48,64,96,128,256)])
