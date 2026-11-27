package io.github.arilcihuyy.snscanner;

/** A scan that did not appear in a match list. */
public final class UnmatchedItem {
    public String sn = "";
    public String format = "";
    public String at;
    public int count = 1;

    public UnmatchedItem() {
    }

    public UnmatchedItem(String sn, String format, String at, int count) {
        this.sn = sn;
        this.format = format;
        this.at = at;
        this.count = count;
    }
}
