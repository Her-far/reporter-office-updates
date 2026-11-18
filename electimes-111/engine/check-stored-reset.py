"""A real saved frame reset must survive a paste into the preceding frame."""
import base64, io, json, sys, zipfile, xml.etree.ElementTree as ET

ns = {'p': 'http://www.hancom.co.kr/hwpml/2011/paragraph'}
def paragraphs(encoded):
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(encoded))) as archive:
        section = ET.fromstring(archive.read('Contents/section0.xml'))
    cell = section.findall('.//p:tbl/p:tr/p:tc', ns)[1]
    return [p.findall('p:linesegarray/p:lineseg', ns) for p in cell.findall('p:subList/p:p', ns)]

payload = json.load(sys.stdin)
before, after = paragraphs(payload['before']), paragraphs(payload['after'])
assert len(after) == len(before) + 1, 'Pasted two paragraphs into one'
assert int(before[-1][0].get('vertpos')) == 0, 'Fixture must have a saved frame reset'
assert [s.get('vertpos') for s in after[-1]] == [s.get('vertpos') for s in before[-1]], 'Saved next-frame origins must remain unchanged'
for previous, current in zip(after[:-2], after[1:-1]):
    end = previous[-1]
    next_origin = int(end.get('vertpos')) + int(end.get('vertsize')) + int(end.get('spacing'))
    assert int(current[0].get('vertpos')) == next_origin, 'Inserted paragraphs must join the destination frame'
print(json.dumps({'savedFrameResetPreserved': True, 'insertedParagraphsConnected': True}))
