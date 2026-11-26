package io.github.arilcihuyy.snscanner;

import java.util.ArrayList;
import java.util.List;

public final class MatchSession {
    public final List<MatchItem> items = new ArrayList<>();
    public String createdAt;

    public int foundCount() {
        int count = 0;
        for (MatchItem item : items) {
            if (item.isFound()) count++;
        }
        return count;
    }

    public int remainingCount() {
        return items.size() - foundCount();
    }
}
