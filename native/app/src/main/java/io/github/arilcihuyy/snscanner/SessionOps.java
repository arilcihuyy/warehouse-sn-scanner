package io.github.arilcihuyy.snscanner;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Pure session operations, independent from Android so they can be unit-tested. */
public final class SessionOps {
    public enum Status {NEW, MATCHED, ALREADY, UNMATCHED, UNMATCHED_DUP, DUP, INVALID}

    public enum UpdateStatus {UPDATED, DUP, INVALID, NOT_FOUND}

    public static final class Meta {
        public String sn;
        public String format = "";
        public String name = "";
        public String brand = SnUtil.BRAND_AUTO;
        public String category = SnUtil.DEFAULT_CATEGORY;
        public String location = "";
        public String notes = "";
        public int qty = 1;

        public Meta() {
        }

        public static Meta empty() {
            return new Meta();
        }

        public Meta copy() {
            Meta meta = new Meta();
            meta.sn = sn;
            meta.format = format;
            meta.name = name;
            meta.brand = brand;
            meta.category = category;
            meta.location = location;
            meta.notes = notes;
            meta.qty = qty;
            return meta;
        }
    }

    public static final class Result {
        public final Status status;
        public final int index;
        public final ScanItem item;

        Result(Status status, int index, ScanItem item) {
            this.status = status;
            this.index = index;
            this.item = item;
        }
    }

    public static final class UpdateResult {
        public final UpdateStatus status;
        public final int index;

        UpdateResult(UpdateStatus status, int index) {
            this.status = status;
            this.index = index;
        }
    }

    public static final class Summary {
        public int unique;
        public int totalScans;
        public int duplicates;
        public int qty;
        public int matched;
        public int remaining;
        public int unmatched;
    }

    public static final class Recap {
        public final List<String> headers = new ArrayList<>();
        public final List<List<Object>> rows = new ArrayList<>();
    }

    private SessionOps() {
    }

    public static ScanSession create(String mode, String name, String at) {
        ScanSession session = new ScanSession();
        session.mode = ScanSession.MODE_MATCH.equals(mode) ? ScanSession.MODE_MATCH : ScanSession.MODE_COLLECT;
        session.name = SnUtil.clean(name);
        if (session.name.isEmpty()) {
            session.name = session.isMatch() ? "Cocokkan Daftar" : "Scan Bebas";
        }
        session.createdAt = at;
        session.updatedAt = at;
        return session;
    }

    public static Result addScan(ScanSession session, String raw, Meta meta, String at) {
        String sn = SnUtil.clean(raw);
        String key = SnUtil.key(sn);
        if (key.isEmpty()) return new Result(Status.INVALID, -1, null);
        Meta safe = meta == null ? Meta.empty() : meta;
        String stamp = at == null ? SnUtil.nowIso() : at;

        if (session.isMatch()) {
            int index = session.indexOfSn(sn);
            if (index >= 0) {
                ScanItem existing = session.items.get(index);
                if (existing.isFound()) return new Result(Status.ALREADY, index, existing);
                existing.status = ScanItem.FOUND;
                existing.scannedAt = stamp;
                if (safe.format != null && !safe.format.trim().isEmpty()) {
                    existing.format = safe.format;
                }
                session.updatedAt = stamp;
                return new Result(Status.MATCHED, index, existing);
            }
            String unmatchedKey = SnUtil.key(sn);
            for (int i = 0; i < session.unmatched.size(); i++) {
                UnmatchedItem entry = session.unmatched.get(i);
                if (SnUtil.key(entry.sn).equals(unmatchedKey)) {
                    entry.count = SnUtil.qty(entry.count) + 1;
                    entry.at = stamp;
                    session.updatedAt = stamp;
                    return new Result(Status.UNMATCHED_DUP, i, null);
                }
            }
            UnmatchedItem item = new UnmatchedItem(sn, safe.format == null ? "" : safe.format, stamp, 1);
            session.unmatched.add(0, item);
            session.updatedAt = stamp;
            return new Result(Status.UNMATCHED, 0, null);
        }

        int index = session.indexOfSn(sn);
        if (index >= 0) {
            // A serial number is one physical row; do not bump scanCount or lastAt.
            session.duplicateScans = Math.max(0, session.duplicateScans) + 1;
            session.updatedAt = stamp;
            return new Result(Status.DUP, index, session.items.get(index));
        }
        ScanItem item = new ScanItem(sn, resolveBrand(sn, safe.brand, session.activeBrand), stamp, stamp);
        applyMeta(item, safe, sn);
        item.brand = resolveBrand(sn, safe.brand, session.activeBrand);
        item.scanCount = 1;
        session.items.add(0, item);
        session.updatedAt = stamp;
        return new Result(Status.NEW, 0, item);
    }

    public static Result addExpected(ScanSession session, String raw, Meta meta, String at) {
        if (session == null || !session.isMatch()) return new Result(Status.INVALID, -1, null);
        String sn = SnUtil.clean(raw);
        String key = SnUtil.key(sn);
        if (key.isEmpty()) return new Result(Status.INVALID, -1, null);
        int existing = session.indexOfSn(sn);
        if (existing >= 0) return new Result(Status.DUP, existing, session.items.get(existing));
        String stamp = at == null ? SnUtil.nowIso() : at;
        Meta safe = meta == null ? Meta.empty() : meta;
        ScanItem item = new ScanItem(sn, resolveBrand(sn, safe.brand, session.activeBrand), stamp, stamp);
        applyMeta(item, safe, sn);
        item.brand = resolveBrand(sn, safe.brand, session.activeBrand);
        item.status = ScanItem.PENDING;
        item.scannedAt = null;
        session.items.add(0, item);
        for (int i = session.unmatched.size() - 1; i >= 0; i--) {
            if (SnUtil.key(session.unmatched.get(i).sn).equals(key)) session.unmatched.remove(i);
        }
        session.updatedAt = stamp;
        return new Result(Status.NEW, 0, item);
    }

    /** Replace the expected list, like the web "Mulai Cocokkan" action. */
    public static void setExpected(ScanSession session, List<String> values, String at) {
        String stamp = at == null ? SnUtil.nowIso() : at;
        session.mode = ScanSession.MODE_MATCH;
        session.items.clear();
        session.unmatched.clear();
        session.duplicateScans = 0;
        Set<String> seen = new LinkedHashSet<>();
        for (String raw : values) {
            String sn = SnUtil.clean(raw);
            String key = SnUtil.key(sn);
            if (key.isEmpty() || !seen.add(key)) continue;
            ScanItem item = new ScanItem(sn, SnUtil.guessBrand(sn), stamp, stamp);
            item.category = SnUtil.DEFAULT_CATEGORY;
            item.status = ScanItem.PENDING;
            session.items.add(item);
        }
        session.updatedAt = stamp;
    }

    public static UpdateResult replaceItem(ScanSession session, String originalSn, Meta meta) {
        int index = session.indexOfSn(originalSn);
        if (index < 0) return new UpdateResult(UpdateStatus.NOT_FOUND, -1);
        ScanItem current = session.items.get(index);
        String sn = SnUtil.clean(meta == null || meta.sn == null ? current.sn : meta.sn);
        String key = SnUtil.key(sn);
        if (key.isEmpty()) return new UpdateResult(UpdateStatus.INVALID, index);
        for (int i = 0; i < session.items.size(); i++) {
            if (i != index && SnUtil.key(session.items.get(i).sn).equals(key)) {
                return new UpdateResult(UpdateStatus.DUP, i);
            }
        }
        current.sn = sn;
        applyMeta(current, meta, sn);
        session.updatedAt = SnUtil.nowIso();
        return new UpdateResult(UpdateStatus.UPDATED, index);
    }

    public static boolean deleteItem(ScanSession session, String sn) {
        int index = session.indexOfSn(sn);
        if (index < 0) return false;
        session.items.remove(index);
        session.updatedAt = SnUtil.nowIso();
        return true;
    }

    public static boolean toggleFound(ScanSession session, String sn, String at) {
        int index = session.indexOfSn(sn);
        if (index < 0) return false;
        ScanItem item = session.items.get(index);
        if (item.isFound()) {
            item.status = ScanItem.PENDING;
            item.scannedAt = null;
        } else {
            item.status = ScanItem.FOUND;
            item.scannedAt = at == null ? SnUtil.nowIso() : at;
        }
        session.updatedAt = at == null ? SnUtil.nowIso() : at;
        return true;
    }

    public static Summary summary(ScanSession session) {
        Summary summary = new Summary();
        if (session == null) return summary;
        summary.unique = session.items.size();
        summary.duplicates = Math.max(0, session.duplicateScans);
        summary.totalScans = summary.duplicates;
        for (ScanItem item : session.items) {
            int scans = session.isMatch() ? (item.isFound() ? 1 : 0) : SnUtil.qty(item.scanCount);
            summary.totalScans += scans;
            if (!session.isMatch()) summary.duplicates += Math.max(0, scans - 1);
            summary.qty += SnUtil.qty(item.qty);
            if (item.isFound()) summary.matched++;
        }
        summary.remaining = summary.unique - summary.matched;
        for (UnmatchedItem item : session.unmatched) {
            int count = SnUtil.qty(item.count);
            summary.totalScans += count;
            summary.duplicates += Math.max(0, count - 1);
        }
        summary.unmatched = session.unmatched.size();
        return summary;
    }

    public static List<ScanItem> filter(List<ScanItem> items, String query, String category,
                                        boolean duplicatesOnly, boolean todayOnly,
                                        String sort, long todayStartMillis) {
        String needle = SnUtil.clean(query).toUpperCase(Locale.ROOT);
        List<ScanItem> filtered = new ArrayList<>();
        for (ScanItem item : items) {
            if (!needle.isEmpty()) {
                String haystack = (item.sn + " " + item.name + " " + item.brand + " "
                        + item.category + " " + item.location).toUpperCase(Locale.ROOT);
                if (!haystack.contains(needle)) continue;
            }
            if (category != null && !category.isEmpty() && !category.equals(item.category)) continue;
            if (duplicatesOnly && SnUtil.qty(item.scanCount) < 2) continue;
            if (todayOnly) {
                long at = SnUtil.millis(item.timeStamp());
                if (at == 0 || at < todayStartMillis) continue;
            }
            filtered.add(item);
        }
        final boolean oldest = "oldest".equals(sort);
        Collections.sort(filtered, new Comparator<ScanItem>() {
            @Override
            public int compare(ScanItem a, ScanItem b) {
                long diff = SnUtil.millis(b.timeStamp()) - SnUtil.millis(a.timeStamp());
                int result = Long.compare(diff, 0);
                if (result == 0) {
                    result = items.indexOf(b) - items.indexOf(a);
                }
                return oldest ? -result : result;
            }
        });
        return filtered;
    }

    public static long startOfToday() {
        Calendar calendar = Calendar.getInstance();
        calendar.set(Calendar.HOUR_OF_DAY, 0);
        calendar.set(Calendar.MINUTE, 0);
        calendar.set(Calendar.SECOND, 0);
        calendar.set(Calendar.MILLISECOND, 0);
        return calendar.getTimeInMillis();
    }

    /** No | one column per brand present | last row "jumlah". */
    public static Recap collectRecap(List<ScanItem> items) {
        Recap recap = new Recap();
        List<String> columns = new ArrayList<>();
        for (String brand : SnUtil.BRANDS) {
            for (ScanItem item : items) {
                if (brand.equals(item.brand)) {
                    columns.add(brand);
                    break;
                }
            }
        }
        List<List<String>> buckets = new ArrayList<>();
        for (int i = 0; i < columns.size(); i++) buckets.add(new ArrayList<String>());
        for (ScanItem item : items) {
            int index = columns.indexOf(item.brand);
            if (index < 0) {
                columns.add(SnUtil.BRAND_OTHER);
                buckets.add(new ArrayList<String>());
                index = columns.size() - 1;
            }
            buckets.get(index).add(item.sn);
        }
        recap.headers.add("No");
        recap.headers.addAll(columns);
        int maxRows = 0;
        for (List<String> bucket : buckets) maxRows = Math.max(maxRows, bucket.size());
        for (int row = 0; row < maxRows; row++) {
            List<Object> values = new ArrayList<>();
            values.add(row + 1);
            for (List<String> bucket : buckets) {
                values.add(row < bucket.size() ? bucket.get(row) : "");
            }
            recap.rows.add(values);
        }
        List<Object> total = new ArrayList<>();
        total.add("jumlah");
        for (List<String> bucket : buckets) total.add(bucket.size());
        recap.rows.add(total);
        return recap;
    }

    public static List<List<Object>> exportRows(ScanSession session) {
        List<List<Object>> rows = new ArrayList<>();
        int no = 1;
        for (ScanItem item : session.items) {
            List<Object> row = new ArrayList<>();
            row.add(no++);
            row.add(item.sn);
            row.add(item.displayName());
            row.add(item.brand);
            row.add(item.category);
            row.add(SnUtil.qty(item.qty));
            row.add(item.location == null ? "" : item.location);
            row.add(SnUtil.formatTime(item.timeStamp()));
            row.add(item.notes == null ? "" : item.notes);
            row.add(session.isMatch() ? (item.isFound() ? 1 : 0) : SnUtil.qty(item.scanCount));
            row.add(item.isFound() ? "Ketemu" : item.status.equals(ScanItem.PENDING) ? "Sisa" : "");
            row.add(item.format == null ? "" : item.format);
            rows.add(row);
        }
        return rows;
    }

    private static String resolveBrand(String sn, String explicitBrand, String activeBrand) {
        String explicit = SnUtil.clean(explicitBrand);
        if (!explicit.isEmpty() && !explicit.equalsIgnoreCase(SnUtil.BRAND_AUTO)) {
            return SnUtil.normalizeBrand(explicit);
        }
        if (!SnUtil.isAutoBrand(activeBrand)) return SnUtil.normalizeBrand(activeBrand);
        return SnUtil.guessBrand(sn);
    }

    private static void applyMeta(ScanItem item, Meta meta, String sn) {
        if (meta == null) return;
        item.name = SnUtil.clean(meta.name);
        String brand = SnUtil.clean(meta.brand);
        item.brand = brand.isEmpty() || brand.equalsIgnoreCase(SnUtil.BRAND_AUTO)
                ? SnUtil.guessBrand(sn)
                : SnUtil.normalizeBrand(brand);
        item.category = SnUtil.normalizeCategory(meta.category);
        item.qty = SnUtil.qty(meta.qty);
        item.location = SnUtil.clean(meta.location);
        item.notes = meta.notes == null ? "" : meta.notes;
        if (meta.format != null && !meta.format.trim().isEmpty()) item.format = meta.format.trim();
    }
}
