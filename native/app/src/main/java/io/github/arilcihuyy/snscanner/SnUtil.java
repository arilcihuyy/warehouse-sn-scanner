package io.github.arilcihuyy.snscanner;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/** Serial-number cleanup, comparison keys, brand inference, categories and timestamps. */
public final class SnUtil {
    public static final String BRAND_ZTE = "ZTE";
    public static final String BRAND_HUAWEI = "Huawei";
    public static final String BRAND_FIBERHOME = "FiberHome";
    public static final String BRAND_RCM = "RCM";
    public static final String BRAND_OTHER = "Lainnya";
    public static final String BRAND_AUTO = "auto";

    public static final String[] BRANDS = {
            BRAND_ZTE, BRAND_HUAWEI, BRAND_FIBERHOME, BRAND_RCM, BRAND_OTHER
    };
    public static final String[] CATEGORIES = {
            "Perangkat", "Aksesoris", "Konsumsi", "Dokumen", "Lainnya"
    };
    public static final String DEFAULT_CATEGORY = "Perangkat";

    private static final String[] ISO_PATTERNS = {
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
            "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
            "yyyy-MM-dd'T'HH:mm:ssXXX"
    };

    private SnUtil() {
    }

    public static String clean(String raw) {
        if (raw == null) return "";
        String s = raw
                .replace("\u200B", "")
                .replace("\u200C", "")
                .replace("\u200D", "")
                .replace("\uFEFF", "");
        return s.replaceAll("\\s+", " ").trim();
    }

    /** Comparison key: spaces and case are ignored. */
    public static String key(String raw) {
        return clean(raw).replaceAll("\\s+", "").toUpperCase(Locale.ROOT);
    }

    public static boolean same(String a, String b) {
        return !key(a).isEmpty() && key(a).equals(key(b));
    }

    public static String[] brandOrder() {
        return BRANDS.clone();
    }

    public static boolean isKnownBrand(String raw) {
        String n = normalizeBrand(raw);
        return n.equals(raw);
    }

    public static String normalizeBrand(String raw) {
        if (raw == null) return BRAND_OTHER;
        String s = raw.trim().toLowerCase(Locale.ROOT).replaceAll("[\\s_-]+", "");
        if (s.equals("zte")) return BRAND_ZTE;
        if (s.equals("huawei") || s.equals("hw")) return BRAND_HUAWEI;
        if (s.equals("fiberhome") || s.equals("fh")) return BRAND_FIBERHOME;
        if (s.equals("rcm")) return BRAND_RCM;
        return BRAND_OTHER;
    }

    public static boolean isAutoBrand(String raw) {
        return raw == null || raw.trim().isEmpty() || raw.trim().equalsIgnoreCase(BRAND_AUTO);
    }

    public static String guessBrand(String raw) {
        String k = key(raw).replaceAll("[\\-_.]", "");
        if (k.startsWith("ZTE")) return BRAND_ZTE;
        if (k.startsWith("HWTC") || k.startsWith("HUAWEI") || k.startsWith("48575443")
                || k.startsWith("HW")) return BRAND_HUAWEI;
        if (k.startsWith("FHTT") || k.startsWith("FIBERHOME") || k.startsWith("FH")) {
            return BRAND_FIBERHOME;
        }
        if (k.startsWith("RCM")) return BRAND_RCM;
        return BRAND_OTHER;
    }

    public static String resolveBrand(String raw, String activeBrand) {
        if (isAutoBrand(activeBrand)) return guessBrand(raw);
        return normalizeBrand(activeBrand);
    }

    public static String normalizeCategory(String raw) {
        if (raw == null) return DEFAULT_CATEGORY;
        for (String category : CATEGORIES) {
            if (category.equalsIgnoreCase(raw.trim())) return category;
        }
        return DEFAULT_CATEGORY;
    }

    public static int qty(int value) {
        return Math.max(1, value);
    }

    public static String uid() {
        return "s-" + Long.toString(System.currentTimeMillis(), 36) + "-"
                + Integer.toHexString(new java.util.Random().nextInt(0xFFFFFF));
    }

    private static SimpleDateFormat isoFormat(String pattern) {
        SimpleDateFormat f = new SimpleDateFormat(pattern, Locale.US);
        if (pattern.endsWith("'Z'")) f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f;
    }

    public static String nowIso() {
        return isoFormat(ISO_PATTERNS[0]).format(new Date());
    }

    public static Date parseIso(String iso) {
        if (iso == null || iso.trim().isEmpty()) return null;
        for (String pattern : ISO_PATTERNS) {
            try {
                Date date = isoFormat(pattern).parse(iso);
                if (date != null) return date;
            } catch (ParseException ignored) {
                // Try the next supported shape.
            }
        }
        return null;
    }

    public static long millis(String iso) {
        Date date = parseIso(iso);
        return date == null ? 0L : date.getTime();
    }

    public static String validIso(String iso, String fallback) {
        return parseIso(iso) == null ? fallback : iso;
    }

    public static String formatTime(String iso) {
        if (iso == null || iso.trim().isEmpty() || "null".equals(iso)) return "";
        Date date = parseIso(iso);
        if (date == null) return iso;
        SimpleDateFormat out = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US);
        out.setTimeZone(TimeZone.getDefault());
        return out.format(date);
    }

    public static String shortTime(String iso) {
        if (iso == null || iso.trim().isEmpty() || "null".equals(iso)) return "—";
        Date date = parseIso(iso);
        if (date == null) return "—";
        SimpleDateFormat out = new SimpleDateFormat("HH:mm", Locale.US);
        out.setTimeZone(TimeZone.getDefault());
        return out.format(date);
    }

    public static String stampForFilename() {
        SimpleDateFormat out = new SimpleDateFormat("yyyyMMdd-HHmm", Locale.US);
        return out.format(new Date());
    }

    /** Web parity: lowercase, non-alphanumerics collapsed to one dash. */
    public static String safeFilename(String name) {
        String s = name == null ? "" : name.toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
        return s.isEmpty() ? "sesi" : s;
    }

    /** Web parity: strip characters Android file pickers reject, drop a trailing .xlsx. */
    public static String sanitizeExportName(String value, String fallback) {
        String s = value == null ? "" : value.trim()
                .replaceAll("[\\\\/:*?\"<>|]+", "-")
                .replaceAll("(?i)\\.xlsx$", "")
                .replaceAll("\\s+", " ")
                .replaceAll("^[. ]+|[. ]+$", "");
        return s.isEmpty() ? fallback : s;
    }

    public static String join(List<String> values, String delimiter) {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) b.append(delimiter);
            b.append(values.get(i));
        }
        return b.toString();
    }
}
