'use strict';
const $ = id => document.getElementById(id);
function render(state) {
  $('status').textContent = state.message;
  $('heading').textContent = state.failed ? 'Works에 연결하지 못했습니다' : 'Works를 열고 있습니다';
  $('message').textContent = state.message;
  $('retry').hidden = !state.failed;
}
for (const action of ['reload', 'browser', 'retry']) $(action).addEventListener('click', () => window.worksTab.action(action).catch(() => render({ message: '요청을 처리하지 못했습니다. 다시 시도해 주세요.', failed: true })));
window.worksTab.onState(render);
window.worksTab.action('state').then(render).catch(() => {});
