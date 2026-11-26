package io.github.arilcihuyy.snscanner;

/** Pure session operations, independent from Android so they can be unit-tested. */
public final class SessionOps {
    public enum AddStatus {ADDED, DUP, INVALID}

    public enum UpdateStatus {UPDATED, DUP, INVALID}

    public enum MatchStatus {FOUND, ALREADY, NOT_TARGET, INVALID}

    public static final class AddResult {
        public final AddStatus status;
        public final int index;
        public final CollectItem item;

        AddResult(AddStatus status, int index, CollectItem item) {
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

    public static final class MatchResult {
        public final MatchStatus status;
        public final int index;
        public final String sn;

        MatchResult(MatchStatus status, int index, String sn) {
            this.status = status;
            this.index = index;
            this.sn = sn;
        }
    }

    private SessionOps() {
    }

    public static AddResult addCollect(CollectSession session, String raw, String activeBrand, String at) {
        String sn = SnUtil.clean(raw);
        String key = SnUtil.key(sn);
        if (key.isEmpty()) return new AddResult(AddStatus.INVALID, -1, null);
        for (int i = 0; i < session.items.size(); i++) {
            if (SnUtil.key(session.items.get(i).sn).equals(key)) {
                return new AddResult(AddStatus.DUP, i, session.items.get(i));
            }
        }
        CollectItem item = new CollectItem(sn, SnUtil.resolveBrand(sn, activeBrand), at, at);
        session.items.add(item);
        return new AddResult(AddStatus.ADDED, session.items.size() - 1, item);
    }

    public static UpdateResult updateCollect(
            CollectSession session, int index, String raw, String brand, String at) {
        if (index < 0 || index >= session.items.size()) {
            return new UpdateResult(UpdateStatus.INVALID, index);
        }
        String sn = SnUtil.clean(raw);
        String key = SnUtil.key(sn);
        if (key.isEmpty()) return new UpdateResult(UpdateStatus.INVALID, index);
        for (int i = 0; i < session.items.size(); i++) {
            if (i != index && SnUtil.key(session.items.get(i).sn).equals(key)) {
                return new UpdateResult(UpdateStatus.DUP, i);
            }
        }
        CollectItem item = session.items.get(index);
        item.sn = sn;
        item.brand = SnUtil.isAutoBrand(brand) ? SnUtil.guessBrand(sn) : SnUtil.normalizeBrand(brand);
        item.lastAt = at;
        return new UpdateResult(UpdateStatus.UPDATED, index);
    }

    public static boolean deleteCollect(CollectSession session, int index) {
        if (index < 0 || index >= session.items.size()) return false;
        session.items.remove(index);
        return true;
    }

    public static MatchResult markFound(MatchSession session, String raw, String at) {
        String key = SnUtil.key(raw);
        if (key.isEmpty()) return new MatchResult(MatchStatus.INVALID, -1, SnUtil.clean(raw));
        for (int i = 0; i < session.items.size(); i++) {
            MatchItem item = session.items.get(i);
            if (SnUtil.key(item.sn).equals(key)) {
                if (item.isFound()) return new MatchResult(MatchStatus.ALREADY, i, item.sn);
                item.status = MatchItem.FOUND;
                item.scannedAt = at;
                return new MatchResult(MatchStatus.FOUND, i, item.sn);
            }
        }
        return new MatchResult(MatchStatus.NOT_TARGET, -1, SnUtil.clean(raw));
    }

    public static boolean toggleMatch(MatchSession session, int index, String at) {
        if (index < 0 || index >= session.items.size()) return false;
        MatchItem item = session.items.get(index);
        if (item.isFound()) {
            item.status = MatchItem.PENDING;
            item.scannedAt = null;
        } else {
            item.status = MatchItem.FOUND;
            item.scannedAt = at;
        }
        return true;
    }
}
