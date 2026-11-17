/* Render the original controlled switch inside the editor menu using a React portal.
 * React retains its event handlers and preference state across document changes. */
const fs = require('node:fs');
const path = require('node:path');
module.exports = function compactAutosave(renderer, exact) {
  const file = path.join(renderer, 'assets/index-BIhPflSU.js');
  let code = fs.readFileSync(file, 'utf8');
  const component = `
function CompactAutoSave({children, hostRef}) {
  const [slot, setSlot] = reactExports.useState(null);
  reactExports.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let frame = null, docObserver = null, target = null;
    const clear = () => { docObserver?.disconnect(); docObserver = null; target?.remove(); target = null; };
    const connect = () => {
      clear(); setSlot(null);
      const doc = frame?.contentDocument;
      if (!doc) return;
      const mount = () => {
        const row = doc.querySelector('.wp-menu-scroll');
        if (!row || target) return;
        target = doc.createElement('span');
        target.className = 'wp-autosave-slot';
        row.append(target);
        setSlot(target);
      };
      docObserver = new MutationObserver(mount);
      docObserver.observe(doc, {childList:true, subtree:true});
      mount();
    };
    const findFrame = () => {
      const next = host.querySelector('iframe');
      if (next === frame) return;
      frame?.removeEventListener('load', connect);
      frame = next;
      frame?.addEventListener('load', connect);
      connect();
    };
    const hostObserver = new MutationObserver(findFrame);
    hostObserver.observe(host, {childList:true, subtree:true});
    findFrame();
    return () => { hostObserver.disconnect(); frame?.removeEventListener('load', connect); clear(); };
  }, [hostRef]);
  return slot ? reactDomExports.createPortal(children, slot) : null;
}
`;
  code = exact(code, 'function App() {', component + '\nfunction App() {');
  code = exact(code, 'jsxRuntimeExports.jsx("div", { className: "hwp-topbar", children:',
    'jsxRuntimeExports.jsx(CompactAutoSave, { hostRef, children:');
  code = exact(code, '"data-tip": t2("autoSaveTip"), children:',
    'title: t2("autoSaveTip"), children:');
  fs.writeFileSync(file, code);
  return 'resources/modules/hwp/renderer/assets/index-BIhPflSU.js';
};
