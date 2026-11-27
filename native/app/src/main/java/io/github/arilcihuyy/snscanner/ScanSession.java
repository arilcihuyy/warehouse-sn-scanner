package io.github.arilcihuyy.snscanner;

import java.util.ArrayList;
import java.util.List;

/** StockScan session: one collect or match workspace. */
public final class ScanSession {
    public static final String MODE_COLLECT = "collect";
    public static final String MODE_MATCH = "match";

    public String id = SnUtil.uid();
    public String mode = MODE_COLLECT;
    public String name = "Scan Bebas";
    public String notes = "";
    public String createdAt;
    public String updatedAt;
    public String activeBrand = SnUtil.BRAND_AUTO;
    public int duplicateScans;
    public final List<ScanItem> items = new ArrayList<>();
    public final List<UnmatchedItem> unmatched = new ArrayList<>();

    public boolean isMatch() {
        return MODE_MATCH.equals(mode);
    }

    public int foundCount() {
        int count = 0;
        for (ScanItem item : items) {
            if (item.isFound()) count++;
        }
        return count;
    }

    public int remainingCount() {
        return items.size() - foundCount();
    }

    public int brandCount() {
        ArrayList<String> found = new ArrayList<>();
        for (ScanItem item : items) {
            if (item.brand != null && !found.contains(item.brand)) found.add(item.brand);
        }
        return found.size();
    }

    public int countForBrand(String brand) {
        int count = 0;
        for (ScanItem item : items) {
            if (brand.equals(item.brand)) count++;
        }
        return count;
    }

    public ScanItem bySn(String raw) {
        String key = SnUtil.key(raw);
        if (key.isEmpty()) return null;
        for (ScanItem item : items) {
            if (SnUtil.key(item.sn).equals(key)) return item;
        }
        return null;
    }

    public int indexOfSn(String raw) {
        String key = SnUtil.key(raw);
        if (key.isEmpty()) return -1;
        for (int i = 0; i < items.size(); i++) {
            if (SnUtil.key(items.get(i).sn).equals(key)) return i;
        }
        return -1;
    }
}
