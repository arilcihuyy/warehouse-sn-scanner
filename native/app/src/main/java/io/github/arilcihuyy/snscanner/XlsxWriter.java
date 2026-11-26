package io.github.arilcihuyy.snscanner;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * Minimal dependency-free XLSX writer. Uses inline strings and a single bold header style.
 * Sheets are real worksheets with frozen header, autofilter and column widths.
 */
public final class XlsxWriter {
    public static final class Sheet {
        public final String name;
        public final List<String> headers;
        public final List<List<Object>> rows;
        public final int[] widths;

        public Sheet(String name, List<String> headers, List<List<Object>> rows, int[] widths) {
            this.name = name;
            this.headers = headers == null ? new ArrayList<>() : headers;
            this.rows = rows == null ? new ArrayList<>() : rows;
            this.widths = widths;
        }
    }

    private XlsxWriter() {
    }

    public static byte[] build(List<Sheet> sheets) throws IOException {
        if (sheets == null || sheets.isEmpty()) {
            throw new IllegalArgumentException("At least one sheet is required");
        }
        List<String> names = uniqueNames(sheets);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out, StandardCharsets.UTF_8)) {
            entry(zip, "[Content_Types].xml", contentTypes(sheets));
            entry(zip, "_rels/.rels", rootRels());
            entry(zip, "docProps/core.xml", coreProps());
            entry(zip, "docProps/app.xml", appProps());
            entry(zip, "xl/workbook.xml", workbook(names));
            entry(zip, "xl/_rels/workbook.xml.rels", workbookRels(sheets.size()));
            entry(zip, "xl/styles.xml", styles());
            for (int i = 0; i < sheets.size(); i++) {
                entry(zip, "xl/worksheets/sheet" + (i + 1) + ".xml",
                        worksheet(sheets.get(i), i == 0));
            }
        }
        return out.toByteArray();
    }

    private static List<String> uniqueNames(List<Sheet> sheets) {
        List<String> names = new ArrayList<>();
        Set<String> used = new HashSet<>();
        for (Sheet sheet : sheets) {
            String base = sanitize(sheet.name == null || sheet.name.trim().isEmpty() ? "Sheet" : sheet.name);
            if (base.length() > 31) base = base.substring(0, 31);
            String name = base;
            int n = 2;
            while (used.contains(name.toLowerCase())) {
                String suffix = " " + n++;
                name = base.length() + suffix.length() > 31
                        ? base.substring(0, 31 - suffix.length()) + suffix
                        : base + suffix;
            }
            used.add(name.toLowerCase());
            names.add(name);
        }
        return names;
    }

    private static String sanitize(String name) {
        String s = name.replaceAll("[\\\\/?*\\[\\]:]", " ").trim();
        return s.isEmpty() ? "Sheet" : s;
    }

    private static String contentTypes(List<Sheet> sheets) {
        StringBuilder b = new StringBuilder();
        b.append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>");
        b.append("<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">");
        b.append("<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>");
        b.append("<Default Extension=\"xml\" ContentType=\"application/xml\"/>");
        b.append("<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>");
        for (int i = 0; i < sheets.size(); i++) {
            b.append("<Override PartName=\"/xl/worksheets/sheet").append(i + 1)
                    .append(".xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>");
        }
        b.append("<Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/>");
        b.append("<Override PartName=\"/docProps/core.xml\" ContentType=\"application/vnd.openxmlformats-package.core-properties+xml\"/>");
        b.append("<Override PartName=\"/docProps/app.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.extended-properties+xml\"/>");
        b.append("</Types>");
        return b.toString();
    }

    private static String rootRels() {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
                + "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/>"
                + "<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties\" Target=\"docProps/core.xml\"/>"
                + "<Relationship Id=\"rId3\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties\" Target=\"docProps/app.xml\"/>"
                + "</Relationships>";
    }

    private static String coreProps() {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                + "<cp:coreProperties xmlns:cp=\"http://schemas.openxmlformats.org/package/2006/metadata/core-properties\" "
                + "xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:dcterms=\"http://purl.org/dc/terms/\" "
                + "xmlns:dcmitype=\"http://purl.org/dc/dcmitype/\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\">"
                + "<dc:creator>SN Scanner</dc:creator>"
                + "<cp:lastModifiedBy>SN Scanner</cp:lastModifiedBy>"
                + "<dc:title>Warehouse SN Scanner</dc:title>"
                + "</cp:coreProperties>";
    }

    private static String appProps() {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                + "<Properties xmlns=\"http://schemas.openxmlformats.org/officeDocument/2006/extended-properties\" "
                + "xmlns:vt=\"http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes\">"
                + "<Application>SN Scanner</Application>"
                + "</Properties>";
    }

    private static String workbook(List<String> names) {
        StringBuilder b = new StringBuilder();
        b.append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>");
        b.append("<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" ");
        b.append("xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">");
        b.append("<sheets>");
        for (int i = 0; i < names.size(); i++) {
            b.append("<sheet name=\"").append(xml(names.get(i))).append("\" sheetId=\"").append(i + 1)
                    .append("\" r:id=\"rId").append(i + 1).append("\"/>");
        }
        b.append("</sheets>");
        b.append("<calcPr calcId=\"191029\"/>");
        b.append("</workbook>");
        return b.toString();
    }

    private static String workbookRels(int sheetCount) {
        StringBuilder b = new StringBuilder();
        b.append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>");
        b.append("<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">");
        for (int i = 0; i < sheetCount; i++) {
            b.append("<Relationship Id=\"rId").append(i + 1)
                    .append("\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" ")
                    .append("Target=\"worksheets/sheet").append(i + 1).append(".xml\"/>");
        }
        b.append("<Relationship Id=\"rId").append(sheetCount + 1)
                .append("\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>");
        b.append("</Relationships>");
        return b.toString();
    }

    private static String styles() {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                + "<styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">"
                + "<fonts count=\"2\">"
                + "<font><sz val=\"11\"/><color theme=\"1\"/><name val=\"Calibri\"/><family val=\"2\"/></font>"
                + "<font><b/><sz val=\"11\"/><color rgb=\"FFFFFFFF\"/><name val=\"Calibri\"/><family val=\"2\"/></font>"
                + "</fonts>"
                + "<fills count=\"3\">"
                + "<fill><patternFill patternType=\"none\"/></fill>"
                + "<fill><patternFill patternType=\"gray125\"/></fill>"
                + "<fill><patternFill patternType=\"solid\"><fgColor rgb=\"FF14120F\"/><bgColor indexed=\"64\"/></patternFill></fill>"
                + "</fills>"
                + "<borders count=\"1\"><border><left/><right/><top/><bottom/><diagonal/></border></borders>"
                + "<cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs>"
                + "<cellXfs count=\"2\">"
                + "<xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\"/>"
                + "<xf numFmtId=\"0\" fontId=\"1\" fillId=\"2\" borderId=\"0\" xfId=\"0\" applyFont=\"1\" applyFill=\"1\"/>"
                + "</cellXfs>"
                + "<cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles>"
                + "</styleSheet>";
    }

    private static String worksheet(Sheet sheet, boolean selected) {
        int columns = Math.max(sheet.headers.size(), maxColumns(sheet.rows));
        int rows = sheet.rows.size() + (sheet.headers.isEmpty() ? 0 : 1);
        int dimCols = Math.max(columns, 1);
        int dimRows = Math.max(rows, 1);
        StringBuilder b = new StringBuilder();
        b.append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>");
        b.append("<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">");
        b.append("<dimension ref=\"A1:").append(columnName(dimCols - 1)).append(dimRows).append("\"/>");
        b.append("<sheetViews><sheetView workbookViewId=\"0\"");
        if (selected) b.append(" tabSelected=\"1\"");
        b.append(">");
        if (!sheet.headers.isEmpty()) {
            b.append("<pane ySplit=\"1\" topLeftCell=\"A2\" activePane=\"bottomLeft\" state=\"frozen\"/>");
        }
        b.append("</sheetView></sheetViews>");
        b.append("<sheetFormatPr defaultRowHeight=\"15\"/>");
        b.append("<cols>");
        for (int i = 0; i < dimCols; i++) {
            int width = sheet.widths != null && i < sheet.widths.length ? sheet.widths[i] : 18;
            b.append("<col min=\"").append(i + 1).append("\" max=\"").append(i + 1)
                    .append("\" width=\"").append(width).append("\" customWidth=\"1\"/>");
        }
        b.append("</cols>");
        b.append("<sheetData>");
        int rowNumber = 1;
        if (!sheet.headers.isEmpty()) {
            b.append("<row r=\"").append(rowNumber).append("\" spans=\"1:").append(dimCols).append("\">");
            for (int c = 0; c < sheet.headers.size(); c++) {
                b.append(cell(columnName(c) + rowNumber, sheet.headers.get(c), 1));
            }
            b.append("</row>");
            rowNumber++;
        }
        for (List<Object> row : sheet.rows) {
            b.append("<row r=\"").append(rowNumber).append("\" spans=\"1:").append(dimCols).append("\">");
            for (int c = 0; c < row.size(); c++) {
                Object value = row.get(c);
                if (value != null) b.append(cell(columnName(c) + rowNumber, value, 0));
            }
            b.append("</row>");
            rowNumber++;
        }
        b.append("</sheetData>");
        if (!sheet.headers.isEmpty()) {
            b.append("<autoFilter ref=\"A1:").append(columnName(dimCols - 1))
                    .append(Math.max(rows, 1)).append("\"/>");
        }
        b.append("</worksheet>");
        return b.toString();
    }

    private static int maxColumns(List<List<Object>> rows) {
        int max = 0;
        for (List<Object> row : rows) max = Math.max(max, row.size());
        return max;
    }

    private static String cell(String ref, Object value, int style) {
        String styleAttr = style == 0 ? "" : " s=\"" + style + "\"";
        if (value instanceof Number) {
            return "<c r=\"" + ref + "\"" + styleAttr + "><v>" + value + "</v></c>";
        }
        if (value instanceof Boolean) {
            return "<c r=\"" + ref + "\"" + styleAttr + " t=\"b\"><v>" + (((Boolean) value) ? "1" : "0") + "</v></c>";
        }
        String text = xml(String.valueOf(value));
        return "<c r=\"" + ref + "\"" + styleAttr + " t=\"inlineStr\"><is><t xml:space=\"preserve\">"
                + text + "</t></is></c>";
    }

    private static String columnName(int index) {
        StringBuilder b = new StringBuilder();
        int n = index + 1;
        while (n > 0) {
            int rem = (n - 1) % 26;
            b.insert(0, (char) ('A' + rem));
            n = (n - 1) / 26;
        }
        return b.toString();
    }

    private static String xml(String value) {
        return value.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&apos;");
    }

    private static void entry(ZipOutputStream zip, String name, String content) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }
}
