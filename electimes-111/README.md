# 전기신문 Office 1.0.11

Fixes stale paragraph positions after internal/HTML paste and range deletion inside HWP table cells. The affected paragraph was rewrapped while later paragraphs kept their old stored vertical positions. Nested HTML paste also omitted reflow.

The patch captures original RowBreak frame boundaries before structural edits, resets only newly pasted paragraph origins to the destination frame, and uses the existing shared cell paragraph spacing calculation. Deleting a truly empty separator retains the following body paragraph format; undo records and restores the original empty-line format as well. Nonempty paragraph merges keep their existing behavior. The exact 1.0.10 payload is retained except for the HWP editing engine, version metadata and source notices.

Validation uses synthetic documents, including nested tables and an explicit saved frame reset. The original paste/deletion patch passes 31 regression scenarios that fail in 23 places on 1.0.10. Three additional regressions now require blank-line removal to preserve body spacing and undo to restore both paragraph formats. Tests cover internal and HTML paste, deletion, Enter, special-character insertion, Backspace, undo/redo and HWP/HWPX round trips. The existing 505 WASM exports/imports and vendor patches remain compatible. Native Windows keyboard validation and installer verification gate automatic publication.

Reproduction: `node engine/cell-flow-regression.mjs <built-core-directory>`. Build source is pinned by `engine/build-core.py`. `engine/cell-flow.patch` is applied after the existing vendor and 1.0.9 table-zone patches. User documents are not part of these fixtures.
