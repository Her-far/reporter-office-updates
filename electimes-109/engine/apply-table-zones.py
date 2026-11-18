"""Patch the pinned rhwp 0.8.7 source; page bands are not parallel columns."""
from pathlib import Path
import sys
source=Path(sys.argv[1])/'src/renderer/layout.rs'
s=source.read_text()
old='''        let body_wide_reserved: Vec<(usize, f64)> = if page_content.column_contents.len() > 1 {
            self.calculate_body_wide_shape_reserved(
                paragraphs,
                &page_content.column_contents,
                &layout.body_area,
            )
        } else {
            Vec::new()
        };
'''
assert s.count(old)==1, 'Unexpected layout source'
s=s.replace(old,'')
old='''            let zone_layout = col_content.zone_layout.as_ref().unwrap_or(layout);
            let col_idx = col_content.column_index as usize;'''
new='''            let zone_layout = col_content.zone_layout.as_ref().unwrap_or(layout);
            // ColumnContent also represents consecutive single-column bands.
            // Only parallel columns share a full-width object's reservation,
            // and a later band's object cannot move an earlier band's origin.
            let zone_start = page_content.column_contents[..col_content_idx]
                .iter()
                .rposition(|col| (col.zone_y_offset - col_content.zone_y_offset).abs() > 0.1)
                .map_or(0, |index| index + 1);
            let zone_end = col_content_idx + page_content.column_contents[col_content_idx..]
                .iter()
                .take_while(|col| (col.zone_y_offset - col_content.zone_y_offset).abs() <= 0.1)
                .count();
            let body_wide_reserved = if zone_layout.column_areas.len() > 1
                && zone_end - zone_start > 1
            {
                self.calculate_body_wide_shape_reserved(
                    paragraphs,
                    &page_content.column_contents[zone_start..zone_end],
                    &layout.body_area,
                )
            } else {
                Vec::new()
            };
            let col_idx = col_content.column_index as usize;'''
assert s.count(old)==1, 'Unexpected column layout anchor'
source.write_text(s.replace(old,new))
