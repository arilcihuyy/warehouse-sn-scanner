package io.github.arilcihuyy.snscanner;

/** One serial number row. Collect rows and match rows share the same shape. */
public final class ScanItem {
    public static final String FOUND = "found";
    public static final String PENDING = "pending";

    public String sn = "";
    public String format = "";
    public String name = "";
    public String brand = SnUtil.BRAND_OTHER;
    public String category = SnUtil.DEFAULT_CATEGORY;
    public int qty = 1;
    public String location = "";
    public String notes = "";
    public String firstAt;
    public String lastAt;
    public int scanCount = 1;
    public String status = PENDING;
    public String scannedAt;

    public ScanItem() {
    }

    public ScanItem(String sn, String brand, String firstAt, String lastAt) {
        this.sn = sn;
        this.brand = brand;
        this.firstAt = firstAt;
        this.lastAt = lastAt;
    }

    public boolean isFound() {
        return FOUND.equals(status);
    }

    public String displayName() {
        return name == null || name.trim().isEmpty() ? sn : name;
    }

    public String timeStamp() {
        if (lastAt != null) return lastAt;
        if (scannedAt != null) return scannedAt;
        return firstAt;
    }

    public ScanItem copy() {
        ScanItem item = new ScanItem(sn, brand, firstAt, lastAt);
        item.format = format;
        item.name = name;
        item.category = category;
        item.qty = qty;
        item.location = location;
        item.notes = notes;
        item.scanCount = scanCount;
        item.status = status;
        item.scannedAt = scannedAt;
        return item;
    }
}
