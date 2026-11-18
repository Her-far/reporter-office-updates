'use strict';
// Align the bundled ieumoffice CLI with the company application.
//
// The 1.0.12 installer ships the upstream CLI unchanged. Its launchers start
// "IeumOffice.exe", which does not exist in an Electimes Office install, and the
// bundle resolves the app profile as %APPDATA%\IeumOffice. The application itself
// uses "Electimes Office.exe" and %APPDATA%\Electimes Office (and exports that
// profile as GENOFFICE_USER_DATA only to its own child processes). Run from a
// terminal or a coding agent, the CLI therefore could not find the app's
// control endpoint or open-document list, and wrote into documents the user had
// open in the app.
//
// Only the product constants the application already uses are changed. Command
// names (ieumoffice, ieumoffice-editor), ~/.ieumoffice skill paths and the
// GENOFFICE_* environment names stay as they are.
const APP_EXE = 'Electimes Office.exe';
const INSTALL_DIR = 'ElectimesOffice';

function exact(source, before, after, label) {
  const parts = source.split(before);
  if (parts.length !== 2) throw Error(`Unexpected ${label} anchor (${parts.length - 1} matches): ${before.slice(0, 90)}`);
  return parts[0] + after + parts[1];
}

const BUNDLE = [
  ['product constants',
    '    PRODUCT_NAME = "IeumOffice";\n    LOCALIZED_PRODUCT_NAMES = {\n      ko: "\\uC774\\uC74C\\uC624\\uD53C\\uC2A4"\n    };',
    '    PRODUCT_NAME = "Electimes Office";\n    LOCALIZED_PRODUCT_NAMES = {\n      ko: "\\uC804\\uAE30\\uC2E0\\uBB38 \\uC624\\uD53C\\uC2A4"\n    };'],
  ['per-user install fallback',
    'env.LOCALAPPDATA ? (0, import_node_path15.join)(env.LOCALAPPDATA, "Programs", APP_BINARY_NAME, `${APP_BINARY_NAME}.exe`) : ""',
    `env.LOCALAPPDATA ? (0, import_node_path15.join)(env.LOCALAPPDATA, "Programs", "${INSTALL_DIR}", \`\${APP_BINARY_NAME}.exe\`) : ""`],
  ['machine install fallback',
    'env.ProgramFiles ? (0, import_node_path15.join)(env.ProgramFiles, APP_BINARY_NAME, `${APP_BINARY_NAME}.exe`) : ""',
    `env.ProgramFiles ? (0, import_node_path15.join)(env.ProgramFiles, "${INSTALL_DIR}", \`\${APP_BINARY_NAME}.exe\`) : ""`],
];

const CMD = [
  ['cmd launcher', '"%~dp0..\\..\\IeumOffice.exe" "%~dp0genoffice.cjs" %*', `"%~dp0..\\..\\${APP_EXE}" "%~dp0genoffice.cjs" %*`],
];

// Git Bash / MSYS on Windows reaches the POSIX launcher.
const SH = [
  ['sh launcher',
    'if [ -x "$here/../../IeumOffice.exe" ]; then app="$here/../../IeumOffice.exe"; else',
    `if [ -x "$here/../../${APP_EXE}" ]; then app="$here/../../${APP_EXE}"; else`],
];

function apply(source, edits) {
  return edits.reduce((s, [label, before, after]) => exact(s, before, after, label), source);
}

/** Patch the three CLI files. Input and output are strings keyed by file name. */
function patchCli(files) {
  return {
    'genoffice.cjs': apply(files['genoffice.cjs'], BUNDLE),
    'ieumoffice.cmd': apply(files['ieumoffice.cmd'], CMD),
    ieumoffice: apply(files.ieumoffice, SH),
  };
}

module.exports = { patchCli, APP_EXE, INSTALL_DIR, CLI_FILES: ['genoffice.cjs', 'ieumoffice.cmd', 'ieumoffice'] };
