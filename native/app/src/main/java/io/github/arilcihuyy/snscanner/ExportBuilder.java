package io.github.arilcihuyy.snscanner;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

public final class ExportBuilder {
    private ExportBuilder() {
    }

    public static byte[] collectWorkbook(CollectSession session) throws IOException {
        List<XlsxWriter.Sheet> sheets = new ArrayList<>();
        List<String> summaryHeaders = Arrays.asList("Merk", "SN unik");
        List<List<Object>> summaryRows = new ArrayList<>();
        int total = 0;
        for (String brand : SnUtil.brandOrder()) {
            int count = session.countForBrand(brand);
            if (count == 0) continue;
            total += count;
            summaryRows.add(Arrays.asList(brand, count));
        }
        summaryRows.add(Arrays.asList("TOTAL", total));
        sheets.add(new XlsxWriter.Sheet("Ringkasan", summaryHeaders, summaryRows, new int[]{22, 12}));

        List<String> allHeaders = Arrays.asList("No", "Merk", "SN", "Scan pertama", "Scan terakhir");
        List<List<Object>> allRows = new ArrayList<>();
        int no = 1;
        for (CollectItem item : session.items) {
            allRows.add(Arrays.asList(no++, item.brand, item.sn,
                    SnUtil.formatTime(item.firstAt), SnUtil.formatTime(item.lastAt)));
        }
        sheets.add(new XlsxWriter.Sheet("Semua", allHeaders, allRows, new int[]{6, 16, 30, 20, 20}));

        List<String> brandHeaders = Arrays.asList("No", "SN", "Scan pertama", "Scan terakhir");
        for (String brand : SnUtil.brandOrder()) {
            List<List<Object>> rows = new ArrayList<>();
            int n = 1;
            for (CollectItem item : session.items) {
                if (!brand.equals(item.brand)) continue;
                rows.add(Arrays.asList(n++, item.sn, SnUtil.formatTime(item.firstAt), SnUtil.formatTime(item.lastAt)));
            }
            if (!rows.isEmpty()) {
                sheets.add(new XlsxWriter.Sheet(brand, brandHeaders, rows, new int[]{6, 30, 20, 20}));
            }
        }
        return XlsxWriter.build(sheets);
    }

    public static byte[] matchWorkbook(MatchSession session) throws IOException {
        List<List<Object>> rows = new ArrayList<>();
        int no = 1;
        for (MatchItem item : session.items) {
            rows.add(Arrays.asList(no++, item.sn, item.isFound() ? "Ketemu" : "Sisa",
                    item.isFound() ? SnUtil.formatTime(item.scannedAt) : ""));
        }
        List<XlsxWriter.Sheet> sheets = new ArrayList<>();
        sheets.add(new XlsxWriter.Sheet("Cocokkan SN",
                Arrays.asList("No", "SN", "Status", "Waktu scan"), rows, new int[]{6, 30, 12, 20}));
        return XlsxWriter.build(sheets);
    }

    public static byte[] collectCsv(CollectSession session) {
        StringBuilder b = new StringBuilder("\uFEFF");
        b.append("No;Merk;SN;Scan pertama;Scan terakhir\r\n");
        int no = 1;
        for (CollectItem item : session.items) {
            b.append(no++).append(';')
                    .append(csv(item.brand)).append(';')
                    .append(csv(item.sn)).append(';')
                    .append(csv(SnUtil.formatTime(item.firstAt))).append(';')
                    .append(csv(SnUtil.formatTime(item.lastAt))).append("\r\n");
        }
        return b.toString().getBytes(StandardCharsets.UTF_8);
    }

    public static byte[] matchCsv(MatchSession session) {
        StringBuilder b = new StringBuilder("\uFEFF");
        b.append("No;SN;Status;Waktu scan\r\n");
        int no = 1;
        for (MatchItem item : session.items) {
            b.append(no++).append(';')
                    .append(csv(item.sn)).append(';')
                    .append(item.isFound() ? "Ketemu" : "Sisa").append(';')
                    .append(csv(item.isFound() ? SnUtil.formatTime(item.scannedAt) : "")).append("\r\n");
        }
        return b.toString().getBytes(StandardCharsets.UTF_8);
    }

    public static String collectTsv(CollectSession session) {
        StringBuilder b = new StringBuilder("No\tMerk\tSN\tScan pertama\tScan terakhir\n");
        int no = 1;
        for (CollectItem item : session.items) {
            b.append(no++).append('\t')
                    .append(item.brand).append('\t')
                    .append(item.sn).append('\t')
                    .append(SnUtil.formatTime(item.firstAt)).append('\t')
                    .append(SnUtil.formatTime(item.lastAt)).append('\n');
        }
        return b.toString();
    }

    public static String matchTsv(MatchSession session) {
        StringBuilder b = new StringBuilder("No\tSN\tStatus\tWaktu scan\n");
        int no = 1;
        for (MatchItem item : session.items) {
            b.append(no++).append('\t')
                    .append(item.sn).append('\t')
                    .append(item.isFound() ? "Ketemu" : "Sisa").append('\t')
                    .append(item.isFound() ? SnUtil.formatTime(item.scannedAt) : "").append('\n');
        }
        return b.toString();
    }

    public static String collectFilename(String ext) {
        return "scan-bebas-" + SnUtil.stampForFilename() + "." + ext;
    }

    public static String matchFilename(String ext) {
        return "cocokkan-sn-" + SnUtil.stampForFilename() + "." + ext;
    }

    private static String csv(String value) {
        if (value == null) return "";
        String s = value.replace("\"", "\"\"");
        if (s.contains(";") || s.contains("\"") || s.contains("\n") || s.contains("\r")) {
            return "\"" + s + "\"";
        }
        return s;
    }
}
