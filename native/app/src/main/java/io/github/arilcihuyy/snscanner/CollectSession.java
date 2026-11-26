package io.github.arilcihuyy.snscanner;

import java.util.ArrayList;
import java.util.List;

public final class CollectSession {
    public final List<CollectItem> items = new ArrayList<>();
    public String activeBrand = SnUtil.BRAND_AUTO;
    public String createdAt;

    public int brandCount() {
        ArrayList<String> found = new ArrayList<>();
        for (CollectItem item : items) {
            if (!found.contains(item.brand)) found.add(item.brand);
        }
        return found.size();
    }

    public int countForBrand(String brand) {
        int count = 0;
        for (CollectItem item : items) {
            if (brand.equals(item.brand)) count++;
        }
        return count;
    }
}
