# 전기신문 Office 1.0.11

Fixes stale paragraph positions after internal/HTML paste and range deletion inside HWP table cells. The affected paragraph was rewrapped while later paragraphs kept their old stored vertical positions. Nested HTML paste also omitted reflow.

The patch captures original RowBreak frame boundaries before structural edits, resets only newly pasted paragraph origins to the destination frame, and uses the existing shared cell paragraph spacing calculation. It does not change authored paragraph styles or line spacing. The exact 1.0.10 payload is retained except for the HWP editing engine, version metadata and source notices.

Validation uses synthetic documents, including nested tables and an explicit saved frame reset. The 1.0.10 engine fails 23 of the 31 regression scenarios; the corrected engine passes all 31. Tests cover internal and HTML paste, deletion, Enter, special-character insertion, Backspace, undo/redo and HWP/HWPX round trips. The existing 505 WASM exports/imports and vendor patches remain compatible. Native Windows keyboard validation and installer verification gate automatic publication.

Reproduction: `node engine/cell-flow-regression.mjs <built-core-directory>`. Build source is pinned by `engine/build-core.py`. `engine/cell-flow.patch` is applied after the existing vendor and 1.0.9 table-zone patches. User documents are not part of these fixtures.
