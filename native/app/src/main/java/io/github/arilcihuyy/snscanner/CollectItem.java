package io.github.arilcihuyy.snscanner;

import java.util.ArrayList;
import java.util.List;

public final class CollectItem {
    public String sn;
    public String brand;
    public String firstAt;
    public String lastAt;

    public CollectItem() {
    }

    public CollectItem(String sn, String brand, String firstAt, String lastAt) {
        this.sn = sn;
        this.brand = brand;
        this.firstAt = firstAt;
        this.lastAt = lastAt;
    }

    public CollectItem copy() {
        return new CollectItem(sn, brand, firstAt, lastAt);
    }
}
