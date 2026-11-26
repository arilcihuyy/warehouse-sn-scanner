package io.github.arilcihuyy.snscanner;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Parses pasted text, .txt or .csv/.tsv SN lists into unique display values. */
public final class ImportParser {
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
                    : line.split(java.util.regex.Pattern.quote(String.valueOf(delimiter)), -1);
            if (column < 0) {
                column = findColumn(cells);
                if (looksLikeHeader(cells)) headerSkipped = true;
                if (headerSkipped) continue;
            }
            int index = Math.min(Math.max(column, 0), cells.length - 1);
            String sn = SnUtil.clean(cells[index]);
            if (sn.isEmpty()) {
                result.skipped++;
                continue;
            }
            String key = SnUtil.key(sn);
            if (key.isEmpty()) {
                result.skipped++;
            } else if (!seen.add(key)) {
                result.duplicates++;
            } else {
                result.items.add(sn);
            }
        }
        if (headerSkipped) result.skipped++;
        return result;
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
            String c = cells[i].trim().toLowerCase(Locale.ROOT);
            if (c.equals("sn") || c.equals("serial number") || c.equals("serial")
                    || c.equals("serialnumber") || c.equals("no sn")) {
                return i;
            }
        }
        return 0;
    }

    private static boolean looksLikeHeader(String[] cells) {
        for (String cell : cells) {
            String c = cell.trim().toLowerCase(Locale.ROOT);
            if (c.equals("sn") || c.equals("serial number") || c.equals("serial")
                    || c.equals("serialnumber") || c.equals("no sn")) {
                return true;
            }
        }
        return false;
    }
}
