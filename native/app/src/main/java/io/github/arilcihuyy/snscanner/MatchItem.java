package io.github.arilcihuyy.snscanner;

public final class MatchItem {
    public static final String PENDING = "pending";
    public static final String FOUND = "found";

    public String sn;
    public String status;
    public String scannedAt;

    public MatchItem() {
    }

    public MatchItem(String sn, String status, String scannedAt) {
        this.sn = sn;
        this.status = status;
        this.scannedAt = scannedAt;
    }

    public boolean isFound() {
        return FOUND.equals(status);
    }
}
