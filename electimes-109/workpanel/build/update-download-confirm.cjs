'use strict';

// Patch the shipped React handler, including both production renderer bundles.
// A completed download must never turn the same click into an install request.
module.exports = function patchUpdateDownloadConfirm(source, exact) {
  const match = source.match(/const next = state\?\.phase === "ready" \? state : await (api2?)\.download\(\);\s*setState\(next\);\s*if \(next\.phase === "ready"\) await \1\.install\(\);/);
  if (!match) throw Error('Update download/install handler anchor missing');
  const api = match[1];
  source = exact(source, match[0], `if (state?.phase === "ready") {
      await ${api}.install();
      return;
    }
    const next = await ${api}.download();
    setState(next);`);
  const escaped = value => [...value].map(c => c.charCodeAt(0) > 127 ? '\\u' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0') : c).join('');
  for (const [before, after] of [
    ['다운로드 및 업데이트', '업데이트 다운로드'],
    ['파일 검증이 끝나면 문서 저장을 확인한 뒤 재시작합니다. 저장 확인을 취소하면 업데이트도 진행하지 않습니다.',
      '다운로드가 끝나도 프로그램은 종료되지 않습니다. 준비되면 ‘재시작하여 업데이트’를 누르세요. 저장 확인을 취소하면 설치하지 않습니다.']
  ]) {
    source = source.includes(before) ? exact(source, before, after) : exact(source, escaped(before), escaped(after));
  }
  return source;
};
