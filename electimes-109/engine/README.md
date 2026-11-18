# HWP column-band correction

The release uses rhwp 0.8.7. Source is pinned to upstream tag commit
`1a76570e833917d15817415a53c09ad61ab3203f`.

`build_columns` used the number of `ColumnContent` entries to decide whether
content had multiple parallel columns. Entries also represent consecutive
single-column bands. The reservation from a later wide table was applied to
the initial band, moving preceding text and tables down before that table was
laid out. This can put the table beyond the page and overlap the footer.

`apply-table-zones.py` scopes shared reservations to the contiguous band and
requires its actual column layout to contain multiple columns. Table settings,
stored text, and page dimensions are not changed. Existing parallel columns
continue sharing full-width reservations within their own band.

The user's source document is used locally for validation and is not included
in this public repository. Generated documents cover the regression in CI.
