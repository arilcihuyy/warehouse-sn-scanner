package io.github.arilcihuyy.snscanner;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Export grids that match the web app: one Rekap sheet for collect, full inventory for match. */
public final class ExportBuilder {
    public static final List<String> EXPORT_HEADERS = Arrays.asList(
            "No", "Barcode/SN", "Nama Produk", "Merk", "Kategori", "Jumlah",
            "Lokasi", "Waktu", "Catatan", "Jumlah Scan", "Status", "Format");

    public static final class ExportData {
        public SessionOps.Summary summary;
        public final List<XlsxWriter.Sheet> sheets = new ArrayList<>();
        public List<String> headers = new ArrayList<>();
        public List<List<Object>> rows = new ArrayList<>();
    }

    private ExportBuilder() {
    }

    public static ExportData build(ScanSession session) {
        ExportData data = new ExportData();
        data.summary = SessionOps.summary(session);
        if (!session.isMatch()) {
            SessionOps.Recap recap = SessionOps.collectRecap(session.items);
            int[] widths = new int[recap.headers.size()];
            widths[0] = 6;
            for (int i = 1; i < widths.length; i++) widths[i] = 26;
            data.sheets.add(new XlsxWriter.Sheet("Rekap", recap.headers, recap.rows, widths));
            data.headers = recap.headers;
            data.rows = recap.rows;
            return data;
        }

        List<List<Object>> summaryRows = new ArrayList<>();
        summaryRows.add(Arrays.asList("Nama sesi", session.name));
        summaryRows.add(Arrays.asList("Mode", "Cocokkan Daftar"));
        summaryRows.add(Arrays.asList("Tanggal ekspor", SnUtil.formatTime(SnUtil.nowIso())));
        summaryRows.add(Arrays.asList("Sesi dimulai", SnUtil.formatTime(session.createdAt)));
        summaryRows.add(Arrays.asList("Total scan", data.summary.totalScans));
        summaryRows.add(Arrays.asList("Barcode unik", data.summary.unique));
        summaryRows.add(Arrays.asList("Duplikat", data.summary.duplicates));
        summaryRows.add(Arrays.asList("Total qty", data.summary.qty));
        summaryRows.add(Arrays.asList("Ketemu", data.summary.matched));
        summaryRows.add(Arrays.asList("Sisa", data.summary.remaining));
        summaryRows.add(Arrays.asList("Tidak cocok", data.summary.unmatched));
        summaryRows.add(Arrays.asList("Catatan sesi", session.notes == null ? "" : session.notes));
        data.sheets.add(new XlsxWriter.Sheet("Ringkasan",
                Arrays.asList("Keterangan", "Nilai"), summaryRows, new int[]{22, 42}));

        List<List<Object>> inventory = SessionOps.exportRows(session);
        data.sheets.add(new XlsxWriter.Sheet("Inventory", EXPORT_HEADERS, inventory,
                new int[]{6, 22, 24, 14, 14, 9, 14, 20, 26, 11, 10, 12}));

        if (!session.unmatched.isEmpty()) {
            List<List<Object>> rows = new ArrayList<>();
            int no = 1;
            for (UnmatchedItem item : session.unmatched) {
                rows.add(Arrays.asList(no++, item.sn, item.format == null ? "" : item.format,
                        SnUtil.formatTime(item.at), item.count));
            }
            data.sheets.add(new XlsxWriter.Sheet("Tidak Cocok",
                    Arrays.asList("No", "Barcode/SN", "Format", "Waktu", "Jumlah Scan"),
                    rows, new int[]{6, 22, 14, 20, 12}));
        }

        data.headers = EXPORT_HEADERS;
        data.rows = inventory;
        return data;
    }

    public static byte[] workbook(ExportData data) throws IOException {
        return XlsxWriter.build(data.sheets);
    }

    public static byte[] csv(ExportData data) {
        return toCsv(data.headers, data.rows).getBytes(StandardCharsets.UTF_8);
    }

    public static String tsv(ExportData data) {
        return toTsv(data.headers, data.rows);
    }

    public static String defaultBase(ScanSession session) {
        return "stockscan-" + SnUtil.safeFilename(session.name) + "-" + SnUtil.stampForFilename();
    }

    /** Web parity: quote only when the value needs it. */
    public static String toCsv(List<String> headers, List<List<Object>> rows) {
        StringBuilder b = new StringBuilder("\uFEFF");
        appendCsvRow(b, headers);
        for (List<Object> row : rows) appendCsvRow(b, row);
        return b.toString();
    }

    private static void appendCsvRow(StringBuilder b, List<?> values) {
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) b.append(';');
            b.append(quote(values.get(i)));
        }
        b.append('\n');
    }

    private static String quote(Object value) {
        String raw = value == null ? "" : String.valueOf(value);
        if (raw.isEmpty()) return "";
        boolean needs = raw.contains(";") || raw.contains("\"")
                || raw.contains("\n") || raw.contains("\r")
                || !raw.equals(raw.trim());
        return needs ? "\"" + raw.replace("\"", "\"\"") + "\"" : raw;
    }

    public static String toTsv(List<String> headers, List<List<Object>> rows) {
        StringBuilder b = new StringBuilder();
        appendTsvRow(b, headers);
        for (List<Object> row : rows) appendTsvRow(b, row);
        return b.toString();
    }

    private static void appendTsvRow(StringBuilder b, List<?> values) {
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) b.append('\t');
            String value = values.get(i) == null ? "" : String.valueOf(values.get(i));
            b.append(value.replaceAll("[\\t\\r\\n]+", " "));
        }
        b.append('\n');
    }
}
