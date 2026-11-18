'use strict';
// No system-wide compatibility flag or display setting is changed.
let binding;
exports.install = () => {
  if (process.platform !== 'win32' || process.arch !== 'x64') return;
  try {
    binding ||= require(require('node:path').join(process.resourcesPath, 'print-compat', 'print_compat.node'));
    const state = binding.status();
    if (!state.installed) console.warn('[print] DPI compatibility unavailable:', state.error);
  } catch (error) {
    // An unavailable optional compatibility module must not prevent app startup.
    console.warn('[print] DPI compatibility unavailable:', error.message);
  }
};
exports.status = () => binding?.status() ?? {installed:false};
