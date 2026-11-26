package io.github.arilcihuyy.snscanner;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/** Serial-number cleanup, comparison keys, brand inference and timestamps. */
public final class SnUtil {
    public static final String BRAND_ZTE = "ZTE";
    public static final String BRAND_HUAWEI = "Huawei";
    public static final String BRAND_FIBERHOME = "FiberHome";
    public static final String BRAND_RCM = "RCM";
    public static final String BRAND_OTHER = "Lainnya";
    public static final String BRAND_AUTO = "auto";

    private static final String[] BRAND_ORDER = {
            BRAND_ZTE, BRAND_HUAWEI, BRAND_FIBERHOME, BRAND_RCM, BRAND_OTHER
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
        return BRAND_ORDER.clone();
    }

    public static String normalizeBrand(String raw) {
        if (raw == null) return BRAND_OTHER;
        String s = raw.trim().toLowerCase(Locale.ROOT);
        if (s.equals("zte")) return BRAND_ZTE;
        if (s.equals("huawei") || s.equals("hw")) return BRAND_HUAWEI;
        if (s.equals("fiberhome") || s.equals("fiber home") || s.equals("fh")) return BRAND_FIBERHOME;
        if (s.equals("rcm")) return BRAND_RCM;
        return BRAND_OTHER;
    }

    public static boolean isAutoBrand(String raw) {
        return raw == null || raw.trim().isEmpty() || raw.trim().equalsIgnoreCase(BRAND_AUTO);
    }

    public static String guessBrand(String raw) {
        String k = key(raw);
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

    private static SimpleDateFormat isoFormat() {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f;
    }

    public static String nowIso() {
        return isoFormat().format(new Date());
    }

    public static String formatTime(String iso) {
        if (iso == null || iso.trim().isEmpty()) return "";
        try {
            Date date = isoFormat().parse(iso);
            if (date == null) return iso;
            SimpleDateFormat out = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US);
            out.setTimeZone(TimeZone.getDefault());
            return out.format(date);
        } catch (ParseException e) {
            return iso;
        }
    }

    public static String shortTime(String iso) {
        if (iso == null || iso.trim().isEmpty()) return "—";
        try {
            Date date = isoFormat().parse(iso);
            if (date == null) return iso;
            SimpleDateFormat out = new SimpleDateFormat("HH:mm", Locale.US);
            out.setTimeZone(TimeZone.getDefault());
            return out.format(date);
        } catch (ParseException e) {
            return iso;
        }
    }

    public static String stampForFilename() {
        SimpleDateFormat out = new SimpleDateFormat("yyyyMMdd-HHmm", Locale.US);
        return out.format(new Date());
    }
}
