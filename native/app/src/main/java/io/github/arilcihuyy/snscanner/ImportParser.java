package io.github.arilcihuyy.snscanner;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/** Parses pasted text, .txt/.csv/.tsv and XLSX rows into unique display values. */
public final class ImportParser {
    private static final Pattern SN_HEADER = Pattern.compile(
            "^(sn|s/n|serial|serial\\s*(number|no\\.?)|serialnumber|no\\.?\\s*sn|nomor\\s*sn|"
                    + "kode\\s*sn|kode\\s*barang|barcode|sn\\s*perangkat)$");

    public static final class Result {
        public final List<String> items = new ArrayList<>();
        public int duplicates;
        public int skipped;
    }

    private ImportParser() {
    }

    public static Result parse(String text) {
        Result result = new Result();
        if (text == null) return result;
        String[] lines = text.replace("\r\n", "\n").replace('\r', '\n').split("\n");
        char delimiter = detectDelimiter(lines);
        int column = -1;
        boolean headerSkipped = false;
        Set<String> seen = new LinkedHashSet<>();

        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.isEmpty() || trimmed.startsWith("#")) continue;
            String[] cells = delimiter == 0
                    ? new String[]{trimmed}
                    : line.split(Pattern.quote(String.valueOf(delimiter)), -1);
            if (column < 0) {
                column = findColumn(cells);
                if (looksLikeHeader(cells)) headerSkipped = true;
                if (headerSkipped) continue;
            }
            int index = Math.min(Math.max(column, 0), cells.length - 1);
            add(result, seen, cells[index]);
        }
        if (headerSkipped) result.skipped++;
        return result;
    }

    public static Result parseValues(List<String> values) {
        Result result = new Result();
        Set<String> seen = new LinkedHashSet<>();
        for (String value : values) add(result, seen, value);
        return result;
    }

    /** Import from the first worksheet, honouring the shared header variants. */
    public static Result parseRows(List<List<String>> rows) {
        if (rows == null || rows.isEmpty()) return new Result();
        int column = headerColumn(rows.get(0));
        List<String> values = new ArrayList<>();
        for (int i = column >= 0 ? 1 : 0; i < rows.size(); i++) {
            List<String> row = rows.get(i);
            if (row == null || row.isEmpty()) continue;
            int index = column >= 0 ? column : 0;
            values.add(index < row.size() ? row.get(index) : "");
        }
        return parseValues(values);
    }

    public static int headerColumn(List<String> row) {
        if (row == null) return -1;
        for (int i = 0; i < row.size(); i++) {
            if (SN_HEADER.matcher(normalizeHeader(row.get(i))).matches()) return i;
        }
        return -1;
    }

    private static void add(Result result, Set<String> seen, String raw) {
        String sn = SnUtil.clean(raw);
        if (sn.isEmpty()) {
            result.skipped++;
            return;
        }
        String key = SnUtil.key(sn);
        if (key.isEmpty()) result.skipped++;
        else if (!seen.add(key)) result.duplicates++;
        else result.items.add(sn);
    }

    private static String normalizeHeader(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT)
                .replaceAll("\\s+", " ");
    }

    private static char detectDelimiter(String[] lines) {
        for (String line : lines) {
            if (line == null || line.trim().isEmpty()) continue;
            if (line.indexOf('\t') >= 0) return '\t';
            int semicolons = count(line, ';');
            int commas = count(line, ',');
            if (semicolons > 0 && semicolons >= commas) return ';';
            if (commas > 0) return ',';
            return 0;
        }
        return 0;
    }

    private static int count(String value, char c) {
        int n = 0;
        for (int i = 0; i < value.length(); i++) if (value.charAt(i) == c) n++;
        return n;
    }

    private static int findColumn(String[] cells) {
        for (int i = 0; i < cells.length; i++) {
            if (SN_HEADER.matcher(normalizeHeader(cells[i])).matches()) return i;
        }
        return 0;
    }

    private static boolean looksLikeHeader(String[] cells) {
        for (String cell : cells) {
            if (SN_HEADER.matcher(normalizeHeader(cell)).matches()) return true;
        }
        return false;
    }
}
