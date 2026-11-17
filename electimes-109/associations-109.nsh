!macro RegisterCompany
WriteRegStr HKCU "Software\RegisteredApplications" "Electimes Office" "Software\ElectimesOffice\Capabilities"
WriteRegStr HKCU "Software\ElectimesOffice\Capabilities" "ApplicationName" "전기신문 오피스"
WriteRegStr HKCU "Software\ElectimesOffice\Capabilities" "ApplicationDescription" "전기신문 오피스"
WriteRegStr HKCU "Software\Classes\Applications\Electimes Office.exe" "FriendlyAppName" "전기신문 오피스"
WriteRegStr HKCU "Software\Classes\Applications\Electimes Office.exe\shell\open\command" "" '$\"$INSTDIR\Electimes Office.exe$\" $\"%1$\"'
WriteRegStr HKCU "Software\Classes\ElectimesOffice.LegacyWordDocument" "" "전기신문 오피스 (.doc)"
WriteRegStr HKCU "Software\Classes\ElectimesOffice.LegacyWordDocument\DefaultIcon" "" '$\"$INSTDIR\Electimes Office.exe$\",0'
WriteRegStr HKCU "Software\Classes\ElectimesOffice.LegacyWordDocument\shell\open\command" "" '$\"$INSTDIR\Electimes Office.exe$\" $\"%1$\"'
WriteRegNone HKCU "Software\Classes\.doc\OpenWithProgids" "ElectimesOffice.LegacyWordDocument"
WriteRegStr HKCU "Software\ElectimesOffice\Capabilities\FileAssociations" ".doc" "ElectimesOffice.LegacyWordDocument"
WriteRegStr HKCU "Software\Classes\Applications\Electimes Office.exe\SupportedTypes" ".doc" ""
WriteRegStr HKCU "Software\Classes\ElectimesOffice.WordDocument" "" "전기신문 오피스 (.docx)"
WriteRegStr HKCU "Software\Classes\ElectimesOffice.WordDocument\DefaultIcon" "" '$\"$INSTDIR\Electimes Office.exe$\",0'
WriteRegStr HKCU "Software\Classes\ElectimesOffice.WordDocument\shell\open\command" "" '$\"$INSTDIR\Electimes Office.exe$\" $\"%1$\"'
WriteRegNone HKCU "Software\Classes\.docx\OpenWithProgids" "ElectimesOffice.WordDocument"
WriteRegStr HKCU "Software\ElectimesOffice\Capabilities\FileAssociations" ".docx" "ElectimesOffice.WordDocument"
WriteRegStr HKCU "Software\Classes\Applications\Electimes Office.exe\SupportedTypes" ".docx" ""
WriteRegStr HKCU "Software\Classes\ElectimesOffice.OpenDocumentText" "" "전기신문 오피스 (.odt)"
WriteRegStr HKCU "Software\Classes\ElectimesOffice.OpenDocumentText\DefaultIcon" "" '$\"$INSTDIR\Electimes Office.exe$\",0'
WriteRegStr HKCU "Software\Classes\ElectimesOffice.OpenDocumentText\shell\open\command" "" '$\"$INSTDIR\Electimes Office.exe$\" $\"%1$\"'
WriteRegNone HKCU "Software\Classes\.odt\OpenWithProgids" "ElectimesOffice.OpenDocumentText"
WriteRegStr HKCU "Software\ElectimesOffice\Capabilities\FileAssociations" ".odt" "ElectimesOffice.OpenDocumentText"
WriteRegStr HKCU "Software\Classes\Applications\Electimes Office.exe\SupportedTypes" ".odt" ""
WriteRegStr HKCU "Software\Classes\ElectimesOffice.ExcelWorkbook" "" "전기신문 오피스 (.xlsx)"
WriteRegStr HKCU "Software\Classes\ElectimesOffice.ExcelWorkbook\DefaultIcon" "" '$\"$INSTDIR\Electimes Office.exe$\",0'
WriteRegStr HKCU "Software\Classes\ElectimesOffice.ExcelWorkbook\shell\open\command" "" '$\"$INSTDIR\Electimes Office.exe$\" $\"%1$\"'
WriteRegNone HKCU "Software\Classes\.xlsx\OpenWithProgids" "ElectimesOffice.ExcelWorkbook"
WriteRegStr HKCU "Software\ElectimesOffice\Capabilities\FileAssociations" ".xlsx" "ElectimesOffice.ExcelWorkbook"
WriteRegStr HKCU "Software\Classes\Applications\Electimes Office.exe\SupportedTypes" ".xlsx" ""
WriteRegStr HKCU "Software\Classes\ElectimesOffice.ExcelMacroEnabledWorkbook" "" "전기신문 오피스 (.xlsm)"
WriteRegStr HKCU "Software\Classes\ElectimesOffice.ExcelMacroEnabledWorkbook\DefaultIcon" "" '$\"$INSTDIR\Electimes Office.exe$\",0'
WriteRegStr HKCU "Software\Classes\ElectimesOffice.ExcelMacroEnabledWorkbook\shell\open\command" "" '$\"$INSTDIR\Electimes Office.exe$\" $\"%1$\"'
WriteRegNone HKCU "Software\Classes\.xlsm\OpenWithProgids" "ElectimesOffice.ExcelMacroEnabledWorkbook"
WriteRegStr HKCU "Software\ElectimesOffice\Capabilities\FileAssociations" ".xlsm" "ElectimesOffice.ExcelMacroEnabledWorkbook"
WriteRegStr HKCU "Software\Classes\Applications\Electimes Office.exe\SupportedTypes" ".xlsm" ""
WriteRegStr HKCU "Software\Classes\ElectimesOffice.Excel972003Workbook" "" "전기신문 오피스 (.xls)"
WriteRegStr HKCU "Software\Classes\ElectimesOffice.Excel972003Workbook\DefaultIcon" "" '$\"$INSTDIR\Electimes Office.exe$\",0'
WriteRegStr HKCU "Software\Classes\ElectimesOffice.Excel972003Workbook\shell\open\command" "" '$\"$INSTDIR\Electimes Office.exe$\" $\"%1$\"'
WriteRegNone HKCU "Software\Classes\.xls\OpenWithProgids" "ElectimesOffice.Excel972003Workbook"
WriteRegStr HKCU "Software\ElectimesOffice\Capabilities\FileAssociations" ".xls" "ElectimesOffice.Excel972003Workbook"
WriteRegStr HKCU "Software\Classes\Applications\Electimes Office.exe\SupportedTypes" ".xls" ""
WriteRegStr HKCU "Software\Classes\ElectimesOffice.PowerPointPresentation" "" "전기신문 오피스 (.pptx)"
WriteRegStr HKCU "Software\Classes\ElectimesOffice.PowerPointPresentation\DefaultIcon" "" '$\"$INSTDIR\Electimes Office.exe$\",0'
WriteRegStr HKCU "Software\Classes\ElectimesOffice.PowerPointPresentation\shell\open\command" "" '$\"$INSTDIR\Electimes Office.exe$\" $\"%1$\"'
WriteRegNone HKCU "Software\Classes\.pptx\OpenWithProgids" "ElectimesOffice.PowerPointPresentation"
WriteRegStr HKCU "Software\ElectimesOffice\Capabilities\FileAssociations" ".pptx" "ElectimesOffice.PowerPointPresentation"
WriteRegStr HKCU "Software\Classes\Applications\Electimes Office.exe\SupportedTypes" ".pptx" ""
WriteRegStr HKCU "Software\Classes\ElectimesOffice.HWPDocument" "" "전기신문 오피스 (.hwp)"
WriteRegStr HKCU "Software\Classes\ElectimesOffice.HWPDocument\DefaultIcon" "" '$\"$INSTDIR\Electimes Office.exe$\",0'
WriteRegStr HKCU "Software\Classes\ElectimesOffice.HWPDocument\shell\open\command" "" '$\"$INSTDIR\Electimes Office.exe$\" $\"%1$\"'
WriteRegNone HKCU "Software\Classes\.hwp\OpenWithProgids" "ElectimesOffice.HWPDocument"
WriteRegStr HKCU "Software\ElectimesOffice\Capabilities\FileAssociations" ".hwp" "ElectimesOffice.HWPDocument"
WriteRegStr HKCU "Software\Classes\Applications\Electimes Office.exe\SupportedTypes" ".hwp" ""
WriteRegStr HKCU "Software\Classes\ElectimesOffice.HWPXDocument" "" "전기신문 오피스 (.hwpx)"
WriteRegStr HKCU "Software\Classes\ElectimesOffice.HWPXDocument\DefaultIcon" "" '$\"$INSTDIR\Electimes Office.exe$\",0'
WriteRegStr HKCU "Software\Classes\ElectimesOffice.HWPXDocument\shell\open\command" "" '$\"$INSTDIR\Electimes Office.exe$\" $\"%1$\"'
WriteRegNone HKCU "Software\Classes\.hwpx\OpenWithProgids" "ElectimesOffice.HWPXDocument"
WriteRegStr HKCU "Software\ElectimesOffice\Capabilities\FileAssociations" ".hwpx" "ElectimesOffice.HWPXDocument"
WriteRegStr HKCU "Software\Classes\Applications\Electimes Office.exe\SupportedTypes" ".hwpx" ""
WriteRegStr HKCU "Software\Classes\ElectimesOffice.PDFDocument" "" "전기신문 오피스 (.pdf)"
WriteRegStr HKCU "Software\Classes\ElectimesOffice.PDFDocument\DefaultIcon" "" '$\"$INSTDIR\Electimes Office.exe$\",0'
WriteRegStr HKCU "Software\Classes\ElectimesOffice.PDFDocument\shell\open\command" "" '$\"$INSTDIR\Electimes Office.exe$\" $\"%1$\"'
WriteRegNone HKCU "Software\Classes\.pdf\OpenWithProgids" "ElectimesOffice.PDFDocument"
WriteRegStr HKCU "Software\ElectimesOffice\Capabilities\FileAssociations" ".pdf" "ElectimesOffice.PDFDocument"
WriteRegStr HKCU "Software\Classes\Applications\Electimes Office.exe\SupportedTypes" ".pdf" ""
WriteRegStr HKCU "Software\Classes\ElectimesOffice.MarkdownDocument" "" "전기신문 오피스 (.md)"
WriteRegStr HKCU "Software\Classes\ElectimesOffice.MarkdownDocument\DefaultIcon" "" '$\"$INSTDIR\Electimes Office.exe$\",0'
WriteRegStr HKCU "Software\Classes\ElectimesOffice.MarkdownDocument\shell\open\command" "" '$\"$INSTDIR\Electimes Office.exe$\" $\"%1$\"'
WriteRegNone HKCU "Software\Classes\.md\OpenWithProgids" "ElectimesOffice.MarkdownDocument"
WriteRegStr HKCU "Software\ElectimesOffice\Capabilities\FileAssociations" ".md" "ElectimesOffice.MarkdownDocument"
WriteRegStr HKCU "Software\Classes\Applications\Electimes Office.exe\SupportedTypes" ".md" ""
WriteRegStr HKCU "Software\Classes\ElectimesOffice.MarkdownDocument" "" "전기신문 오피스 (.markdown)"
WriteRegStr HKCU "Software\Classes\ElectimesOffice.MarkdownDocument\DefaultIcon" "" '$\"$INSTDIR\Electimes Office.exe$\",0'
WriteRegStr HKCU "Software\Classes\ElectimesOffice.MarkdownDocument\shell\open\command" "" '$\"$INSTDIR\Electimes Office.exe$\" $\"%1$\"'
WriteRegNone HKCU "Software\Classes\.markdown\OpenWithProgids" "ElectimesOffice.MarkdownDocument"
WriteRegStr HKCU "Software\ElectimesOffice\Capabilities\FileAssociations" ".markdown" "ElectimesOffice.MarkdownDocument"
WriteRegStr HKCU "Software\Classes\Applications\Electimes Office.exe\SupportedTypes" ".markdown" ""
WriteRegStr HKCU "Software\Classes\ElectimesOffice.CSVDocument" "" "전기신문 오피스 (.csv)"
WriteRegStr HKCU "Software\Classes\ElectimesOffice.CSVDocument\DefaultIcon" "" '$\"$INSTDIR\Electimes Office.exe$\",0'
WriteRegStr HKCU "Software\Classes\ElectimesOffice.CSVDocument\shell\open\command" "" '$\"$INSTDIR\Electimes Office.exe$\" $\"%1$\"'
WriteRegNone HKCU "Software\Classes\.csv\OpenWithProgids" "ElectimesOffice.CSVDocument"
WriteRegStr HKCU "Software\ElectimesOffice\Capabilities\FileAssociations" ".csv" "ElectimesOffice.CSVDocument"
WriteRegStr HKCU "Software\Classes\Applications\Electimes Office.exe\SupportedTypes" ".csv" ""
WriteRegStr HKCU "Software\Classes\ElectimesOffice.TSVDocument" "" "전기신문 오피스 (.tsv)"
WriteRegStr HKCU "Software\Classes\ElectimesOffice.TSVDocument\DefaultIcon" "" '$\"$INSTDIR\Electimes Office.exe$\",0'
WriteRegStr HKCU "Software\Classes\ElectimesOffice.TSVDocument\shell\open\command" "" '$\"$INSTDIR\Electimes Office.exe$\" $\"%1$\"'
WriteRegNone HKCU "Software\Classes\.tsv\OpenWithProgids" "ElectimesOffice.TSVDocument"
WriteRegStr HKCU "Software\ElectimesOffice\Capabilities\FileAssociations" ".tsv" "ElectimesOffice.TSVDocument"
WriteRegStr HKCU "Software\Classes\Applications\Electimes Office.exe\SupportedTypes" ".tsv" ""
WriteRegStr HKCU "Software\Classes\ElectimesOffice.TextDocument" "" "전기신문 오피스 (.txt)"
WriteRegStr HKCU "Software\Classes\ElectimesOffice.TextDocument\DefaultIcon" "" '$\"$INSTDIR\Electimes Office.exe$\",0'
WriteRegStr HKCU "Software\Classes\ElectimesOffice.TextDocument\shell\open\command" "" '$\"$INSTDIR\Electimes Office.exe$\" $\"%1$\"'
WriteRegNone HKCU "Software\Classes\.txt\OpenWithProgids" "ElectimesOffice.TextDocument"
WriteRegStr HKCU "Software\ElectimesOffice\Capabilities\FileAssociations" ".txt" "ElectimesOffice.TextDocument"
WriteRegStr HKCU "Software\Classes\Applications\Electimes Office.exe\SupportedTypes" ".txt" ""
WriteRegStr HKCU "Software\Classes\ElectimesOffice.JSONDocument" "" "전기신문 오피스 (.json)"
WriteRegStr HKCU "Software\Classes\ElectimesOffice.JSONDocument\DefaultIcon" "" '$\"$INSTDIR\Electimes Office.exe$\",0'
WriteRegStr HKCU "Software\Classes\ElectimesOffice.JSONDocument\shell\open\command" "" '$\"$INSTDIR\Electimes Office.exe$\" $\"%1$\"'
WriteRegNone HKCU "Software\Classes\.json\OpenWithProgids" "ElectimesOffice.JSONDocument"
WriteRegStr HKCU "Software\ElectimesOffice\Capabilities\FileAssociations" ".json" "ElectimesOffice.JSONDocument"
WriteRegStr HKCU "Software\Classes\Applications\Electimes Office.exe\SupportedTypes" ".json" ""
WriteRegStr HKCU "Software\Classes\ElectimesOffice.HTMLDocument" "" "전기신문 오피스 (.html)"
WriteRegStr HKCU "Software\Classes\ElectimesOffice.HTMLDocument\DefaultIcon" "" '$\"$INSTDIR\Electimes Office.exe$\",0'
WriteRegStr HKCU "Software\Classes\ElectimesOffice.HTMLDocument\shell\open\command" "" '$\"$INSTDIR\Electimes Office.exe$\" $\"%1$\"'
WriteRegNone HKCU "Software\Classes\.html\OpenWithProgids" "ElectimesOffice.HTMLDocument"
WriteRegStr HKCU "Software\ElectimesOffice\Capabilities\FileAssociations" ".html" "ElectimesOffice.HTMLDocument"
WriteRegStr HKCU "Software\Classes\Applications\Electimes Office.exe\SupportedTypes" ".html" ""
WriteRegStr HKCU "Software\Classes\ElectimesOffice.HTMLDocument" "" "전기신문 오피스 (.htm)"
WriteRegStr HKCU "Software\Classes\ElectimesOffice.HTMLDocument\DefaultIcon" "" '$\"$INSTDIR\Electimes Office.exe$\",0'
WriteRegStr HKCU "Software\Classes\ElectimesOffice.HTMLDocument\shell\open\command" "" '$\"$INSTDIR\Electimes Office.exe$\" $\"%1$\"'
WriteRegNone HKCU "Software\Classes\.htm\OpenWithProgids" "ElectimesOffice.HTMLDocument"
WriteRegStr HKCU "Software\ElectimesOffice\Capabilities\FileAssociations" ".htm" "ElectimesOffice.HTMLDocument"
WriteRegStr HKCU "Software\Classes\Applications\Electimes Office.exe\SupportedTypes" ".htm" ""
WriteRegStr HKCU "Software\Classes\ElectimesOffice.MindMap" "" "전기신문 오피스 (.xmind)"
WriteRegStr HKCU "Software\Classes\ElectimesOffice.MindMap\DefaultIcon" "" '$\"$INSTDIR\Electimes Office.exe$\",0'
WriteRegStr HKCU "Software\Classes\ElectimesOffice.MindMap\shell\open\command" "" '$\"$INSTDIR\Electimes Office.exe$\" $\"%1$\"'
WriteRegNone HKCU "Software\Classes\.xmind\OpenWithProgids" "ElectimesOffice.MindMap"
WriteRegStr HKCU "Software\ElectimesOffice\Capabilities\FileAssociations" ".xmind" "ElectimesOffice.MindMap"
WriteRegStr HKCU "Software\Classes\Applications\Electimes Office.exe\SupportedTypes" ".xmind" ""
WriteRegStr HKCU "Software\Classes\ElectimesOffice.EPUBBook" "" "전기신문 오피스 (.epub)"
WriteRegStr HKCU "Software\Classes\ElectimesOffice.EPUBBook\DefaultIcon" "" '$\"$INSTDIR\Electimes Office.exe$\",0'
WriteRegStr HKCU "Software\Classes\ElectimesOffice.EPUBBook\shell\open\command" "" '$\"$INSTDIR\Electimes Office.exe$\" $\"%1$\"'
WriteRegNone HKCU "Software\Classes\.epub\OpenWithProgids" "ElectimesOffice.EPUBBook"
WriteRegStr HKCU "Software\ElectimesOffice\Capabilities\FileAssociations" ".epub" "ElectimesOffice.EPUBBook"
WriteRegStr HKCU "Software\Classes\Applications\Electimes Office.exe\SupportedTypes" ".epub" ""
!macroend
!macro UnregisterCompany
ReadRegStr $0 HKCU "Software\Classes\Applications\Electimes Office.exe\shell\open\command" ""
${If} $0 == '$\"$INSTDIR\Electimes Office.exe$\" $\"%1$\"'
DeleteRegValue HKCU "Software\RegisteredApplications" "Electimes Office"
DeleteRegKey HKCU "Software\ElectimesOffice\Capabilities"
DeleteRegKey HKCU "Software\Classes\Applications\Electimes Office.exe"
DeleteRegKey HKCU "Software\Classes\ElectimesOffice.LegacyWordDocument"
DeleteRegValue HKCU "Software\Classes\.doc\OpenWithProgids" "ElectimesOffice.LegacyWordDocument"
DeleteRegKey HKCU "Software\Classes\ElectimesOffice.WordDocument"
DeleteRegValue HKCU "Software\Classes\.docx\OpenWithProgids" "ElectimesOffice.WordDocument"
DeleteRegKey HKCU "Software\Classes\ElectimesOffice.OpenDocumentText"
DeleteRegValue HKCU "Software\Classes\.odt\OpenWithProgids" "ElectimesOffice.OpenDocumentText"
DeleteRegKey HKCU "Software\Classes\ElectimesOffice.ExcelWorkbook"
DeleteRegValue HKCU "Software\Classes\.xlsx\OpenWithProgids" "ElectimesOffice.ExcelWorkbook"
DeleteRegKey HKCU "Software\Classes\ElectimesOffice.ExcelMacroEnabledWorkbook"
DeleteRegValue HKCU "Software\Classes\.xlsm\OpenWithProgids" "ElectimesOffice.ExcelMacroEnabledWorkbook"
DeleteRegKey HKCU "Software\Classes\ElectimesOffice.Excel972003Workbook"
DeleteRegValue HKCU "Software\Classes\.xls\OpenWithProgids" "ElectimesOffice.Excel972003Workbook"
DeleteRegKey HKCU "Software\Classes\ElectimesOffice.PowerPointPresentation"
DeleteRegValue HKCU "Software\Classes\.pptx\OpenWithProgids" "ElectimesOffice.PowerPointPresentation"
DeleteRegKey HKCU "Software\Classes\ElectimesOffice.HWPDocument"
DeleteRegValue HKCU "Software\Classes\.hwp\OpenWithProgids" "ElectimesOffice.HWPDocument"
DeleteRegKey HKCU "Software\Classes\ElectimesOffice.HWPXDocument"
DeleteRegValue HKCU "Software\Classes\.hwpx\OpenWithProgids" "ElectimesOffice.HWPXDocument"
DeleteRegKey HKCU "Software\Classes\ElectimesOffice.PDFDocument"
DeleteRegValue HKCU "Software\Classes\.pdf\OpenWithProgids" "ElectimesOffice.PDFDocument"
DeleteRegKey HKCU "Software\Classes\ElectimesOffice.MarkdownDocument"
DeleteRegValue HKCU "Software\Classes\.md\OpenWithProgids" "ElectimesOffice.MarkdownDocument"
DeleteRegKey HKCU "Software\Classes\ElectimesOffice.MarkdownDocument"
DeleteRegValue HKCU "Software\Classes\.markdown\OpenWithProgids" "ElectimesOffice.MarkdownDocument"
DeleteRegKey HKCU "Software\Classes\ElectimesOffice.CSVDocument"
DeleteRegValue HKCU "Software\Classes\.csv\OpenWithProgids" "ElectimesOffice.CSVDocument"
DeleteRegKey HKCU "Software\Classes\ElectimesOffice.TSVDocument"
DeleteRegValue HKCU "Software\Classes\.tsv\OpenWithProgids" "ElectimesOffice.TSVDocument"
DeleteRegKey HKCU "Software\Classes\ElectimesOffice.TextDocument"
DeleteRegValue HKCU "Software\Classes\.txt\OpenWithProgids" "ElectimesOffice.TextDocument"
DeleteRegKey HKCU "Software\Classes\ElectimesOffice.JSONDocument"
DeleteRegValue HKCU "Software\Classes\.json\OpenWithProgids" "ElectimesOffice.JSONDocument"
DeleteRegKey HKCU "Software\Classes\ElectimesOffice.HTMLDocument"
DeleteRegValue HKCU "Software\Classes\.html\OpenWithProgids" "ElectimesOffice.HTMLDocument"
DeleteRegKey HKCU "Software\Classes\ElectimesOffice.HTMLDocument"
DeleteRegValue HKCU "Software\Classes\.htm\OpenWithProgids" "ElectimesOffice.HTMLDocument"
DeleteRegKey HKCU "Software\Classes\ElectimesOffice.MindMap"
DeleteRegValue HKCU "Software\Classes\.xmind\OpenWithProgids" "ElectimesOffice.MindMap"
DeleteRegKey HKCU "Software\Classes\ElectimesOffice.EPUBBook"
DeleteRegValue HKCU "Software\Classes\.epub\OpenWithProgids" "ElectimesOffice.EPUBBook"
${EndIf}
!macroend
