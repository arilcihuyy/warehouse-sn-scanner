package io.github.arilcihuyy.snscanner;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * JSON-backed session store. All data stays on the device.
 * Version 5 mirrors the web session model and migrates the old v1
 * single-collect/single-match snapshot without dropping records.
 */
public final class Store {
    private static final String PREFS = "sn_scanner_native";
    private static final String KEY_STATE = "state";
    private static final String KEY_BACKUP_V1 = "state_v1_backup";
    private static final String KEY_SOUND = "settings_sound";
    private static final String KEY_VIBRATION = "settings_vibration";
    private static final int VERSION = 5;

    private static Store instance;

    private final SharedPreferences prefs;
    private final List<ScanSession> sessions = new ArrayList<>();
    private final String[] activeIds = new String[]{null, null};
    private String lastMode = ScanSession.MODE_COLLECT;

    private Store(Context context) {
        prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        load();
    }

    public static synchronized Store get(Context context) {
        if (instance == null) instance = new Store(context);
        return instance;
    }

    /** Test hook: drop the cached singleton so prefs can be re-read. */
    static synchronized void resetForTests() {
        instance = null;
    }

    public synchronized List<ScanSession> list(String mode) {
        List<ScanSession> result = new ArrayList<>();
        for (ScanSession session : sessions) {
            if (session.mode.equals(mode)) result.add(session);
        }
        return result;
    }

    public synchronized ScanSession byId(String id) {
        if (id == null) return null;
        for (ScanSession session : sessions) {
            if (id.equals(session.id)) return session;
        }
        return null;
    }

    public synchronized ScanSession active(String mode) {
        ScanSession session = byId(activeId(mode));
        if (session != null) return session;
        List<ScanSession> candidates = list(mode);
        return candidates.isEmpty() ? null : candidates.get(0);
    }

    public synchronized ScanSession ensure(String mode) {
        ScanSession existing = active(mode);
        if (existing != null) return existing;
        return create(mode, ScanSession.MODE_MATCH.equals(mode) ? "Cocokkan Daftar" : "Scan Bebas");
    }

    public synchronized ScanSession create(String mode, String name) {
        String at = SnUtil.nowIso();
        ScanSession session = SessionOps.create(mode, name, at);
        sessions.add(session);
        activeIds[index(session.mode)] = session.id;
        lastMode = session.mode;
        save();
        return session;
    }

    public synchronized boolean switchTo(String id) {
        ScanSession session = byId(id);
        if (session == null) return false;
        activeIds[index(session.mode)] = session.id;
        lastMode = session.mode;
        save();
        return true;
    }

    /** Persist an already-mutated session, keeping active-session semantics. */
    public synchronized void touch(ScanSession session) {
        if (session == null) return;
        int position = -1;
        for (int i = 0; i < sessions.size(); i++) {
            if (sessions.get(i).id.equals(session.id)) {
                position = i;
                break;
            }
        }
        if (position < 0) {
            sessions.add(session);
            position = sessions.size() - 1;
        } else {
            sessions.set(position, session);
        }
        int modeIndex = index(session.mode);
        if (activeIds[modeIndex] == null || activeIds[modeIndex].equals(session.id)) {
            activeIds[modeIndex] = session.id;
        }
        save();
    }

    public synchronized ScanSession rename(String id, String name) {
        ScanSession session = byId(id);
        if (session == null) return null;
        String clean = SnUtil.clean(name);
        if (!clean.isEmpty()) session.name = clean;
        save();
        return session;
    }

    public synchronized ScanSession clear(String id) {
        ScanSession session = byId(id);
        if (session == null) return null;
        session.items.clear();
        session.unmatched.clear();
        session.duplicateScans = 0;
        session.updatedAt = SnUtil.nowIso();
        save();
        return session;
    }

    public synchronized boolean remove(String id) {
        ScanSession session = byId(id);
        if (session == null) return false;
        sessions.remove(session);
        int modeIndex = index(session.mode);
        if (id.equals(activeIds[modeIndex])) {
            List<ScanSession> remaining = list(session.mode);
            activeIds[modeIndex] = remaining.isEmpty() ? null : remaining.get(0).id;
        }
        save();
        return true;
    }

    public synchronized String lastMode() {
        return lastMode;
    }

    public synchronized void setLastMode(String mode) {
        lastMode = ScanSession.MODE_MATCH.equals(mode) ? ScanSession.MODE_MATCH : ScanSession.MODE_COLLECT;
        save();
    }

    public synchronized boolean soundEnabled() {
        return prefs.getBoolean(KEY_SOUND, true);
    }

    public synchronized void setSoundEnabled(boolean enabled) {
        prefs.edit().putBoolean(KEY_SOUND, enabled).apply();
    }

    public synchronized boolean vibrationEnabled() {
        return prefs.getBoolean(KEY_VIBRATION, true);
    }

    public synchronized void setVibrationEnabled(boolean enabled) {
        prefs.edit().putBoolean(KEY_VIBRATION, enabled).apply();
    }

    public synchronized int sessionCount() {
        return sessions.size();
    }

    private String activeId(String mode) {
        return activeIds[index(mode)];
    }

    private int index(String mode) {
        return ScanSession.MODE_MATCH.equals(mode) ? 1 : 0;
    }

    private void load() {
        String raw = prefs.getString(KEY_STATE, null);
        if (raw == null) return;
        try {
            JSONObject root = new JSONObject(raw);
            if (root.has("sessions")) {
                JSONArray array = root.optJSONArray("sessions");
                if (array != null) {
                    for (int i = 0; i < array.length(); i++) {
                        ScanSession session = readSession(array.optJSONObject(i));
                        if (session != null) sessions.add(session);
                    }
                }
                JSONObject ids = root.optJSONObject("activeIds");
                if (ids != null) {
                    activeIds[0] = validActive(ids.optString("collect", null), ScanSession.MODE_COLLECT);
                    activeIds[1] = validActive(ids.optString("match", null), ScanSession.MODE_MATCH);
                }
                lastMode = "match".equals(root.optString("lastMode")) ? ScanSession.MODE_MATCH : ScanSession.MODE_COLLECT;
                repairActiveIds();
                return;
            }
            if (migrateLegacy(root)) {
                prefs.edit().putString(KEY_BACKUP_V1, raw).apply();
                save();
            }
        } catch (Exception ignored) {
            sessions.clear();
            activeIds[0] = null;
            activeIds[1] = null;
        }
    }

    /** v1 native snapshot: {match:{...}, collect:{...}} */
    private boolean migrateLegacy(JSONObject root) {
        boolean migrated = false;
        JSONObject collect = root.optJSONObject("collect");
        if (collect != null) {
            ScanSession session = new ScanSession();
            session.id = "legacy-collect";
            session.mode = ScanSession.MODE_COLLECT;
            session.name = "Scan Bebas (dipulihkan)";
            session.createdAt = collect.optString("createdAt", SnUtil.nowIso());
            session.updatedAt = session.createdAt;
            session.activeBrand = SnUtil.isAutoBrand(collect.optString("activeBrand"))
                    ? SnUtil.BRAND_AUTO : SnUtil.normalizeBrand(collect.optString("activeBrand"));
            JSONArray items = collect.optJSONArray("items");
            if (items != null) {
                for (int i = 0; i < items.length(); i++) {
                    JSONObject o = items.optJSONObject(i);
                    if (o == null) continue;
                    String sn = SnUtil.clean(o.optString("sn"));
                    if (SnUtil.key(sn).isEmpty() || session.bySn(sn) != null) continue;
                    String brand = o.optString("brand", "");
                    ScanItem item = new ScanItem(sn,
                            brand.isEmpty() ? SnUtil.guessBrand(sn) : SnUtil.normalizeBrand(brand),
                            o.optString("firstAt", session.createdAt),
                            o.optString("lastAt", session.createdAt));
                    item.category = SnUtil.DEFAULT_CATEGORY;
                    item.qty = 1;
                    item.scanCount = 1;
                    session.items.add(item);
                }
            }
            if (!session.items.isEmpty()) {
                sessions.add(session);
                activeIds[0] = session.id;
                migrated = true;
            }
        }
        JSONObject match = root.optJSONObject("match");
        if (match != null) {
            ScanSession session = new ScanSession();
            session.id = "legacy-match";
            session.mode = ScanSession.MODE_MATCH;
            session.name = "Cocokkan Daftar (dipulihkan)";
            session.createdAt = match.optString("createdAt", SnUtil.nowIso());
            session.updatedAt = session.createdAt;
            JSONArray items = match.optJSONArray("items");
            if (items != null) {
                for (int i = 0; i < items.length(); i++) {
                    JSONObject o = items.optJSONObject(i);
                    if (o == null) continue;
                    String sn = SnUtil.clean(o.optString("sn"));
                    if (SnUtil.key(sn).isEmpty() || session.bySn(sn) != null) continue;
                    ScanItem item = new ScanItem(sn, SnUtil.guessBrand(sn), session.createdAt, session.createdAt);
                    boolean found = ScanItem.FOUND.equals(o.optString("status"));
                    item.status = found ? ScanItem.FOUND : ScanItem.PENDING;
                    String scanned = o.optString("scannedAt", "");
                    item.scannedAt = found && !scanned.isEmpty() && !"null".equals(scanned)
                            ? scanned : (found ? session.createdAt : null);
                    item.category = SnUtil.DEFAULT_CATEGORY;
                    item.qty = 1;
                    session.items.add(item);
                }
            }
            if (!session.items.isEmpty()) {
                sessions.add(session);
                activeIds[1] = session.id;
                migrated = true;
            }
        }
        if (migrated) lastMode = activeIds[0] != null ? ScanSession.MODE_COLLECT : ScanSession.MODE_MATCH;
        return migrated;
    }

    private String validActive(String id, String mode) {
        ScanSession session = byId(id);
        return session != null && session.mode.equals(mode) ? id : null;
    }

    private void repairActiveIds() {
        if (activeIds[0] == null) {
            List<ScanSession> collect = list(ScanSession.MODE_COLLECT);
            activeIds[0] = collect.isEmpty() ? null : collect.get(0).id;
        }
        if (activeIds[1] == null) {
            List<ScanSession> match = list(ScanSession.MODE_MATCH);
            activeIds[1] = match.isEmpty() ? null : match.get(0).id;
        }
    }

    private ScanSession readSession(JSONObject o) {
        if (o == null) return null;
        ScanSession session = new ScanSession();
        session.id = SnUtil.clean(o.optString("id"));
        if (session.id.isEmpty()) session.id = SnUtil.uid();
        session.mode = "match".equals(o.optString("mode")) ? ScanSession.MODE_MATCH : ScanSession.MODE_COLLECT;
        session.name = SnUtil.clean(o.optString("name"));
        if (session.name.isEmpty()) session.name = session.isMatch() ? "Cocokkan Daftar" : "Scan Bebas";
        session.notes = o.optString("notes", "");
        session.createdAt = SnUtil.validIso(o.optString("createdAt"), SnUtil.nowIso());
        session.updatedAt = SnUtil.validIso(o.optString("updatedAt"), session.createdAt);
        session.activeBrand = SnUtil.isAutoBrand(o.optString("activeBrand"))
                ? SnUtil.BRAND_AUTO : SnUtil.normalizeBrand(o.optString("activeBrand"));
        session.duplicateScans = Math.max(0, o.optInt("duplicateScans", 0));
        JSONArray items = o.optJSONArray("items");
        if (items != null) {
            for (int i = 0; i < items.length(); i++) {
                ScanItem item = readItem(items.optJSONObject(i), session);
                if (item != null && session.bySn(item.sn) == null) session.items.add(item);
            }
        }
        JSONArray unmatched = o.optJSONArray("unmatched");
        if (unmatched != null) {
            for (int i = 0; i < unmatched.length(); i++) {
                JSONObject u = unmatched.optJSONObject(i);
                if (u == null) continue;
                String sn = SnUtil.clean(u.optString("sn"));
                if (sn.isEmpty()) continue;
                UnmatchedItem item = new UnmatchedItem(sn, u.optString("format", ""),
                        SnUtil.validIso(u.optString("at"), session.createdAt),
                        SnUtil.qty(u.optInt("count", 1)));
                session.unmatched.add(item);
            }
        }
        return session;
    }

    private ScanItem readItem(JSONObject o, ScanSession session) {
        if (o == null) return null;
        String sn = SnUtil.clean(o.optString("sn"));
        if (sn.isEmpty()) return null;
        String brand = o.optString("brand", "");
        ScanItem item = new ScanItem(sn,
                brand.isEmpty() ? SnUtil.guessBrand(sn) : SnUtil.normalizeBrand(brand),
                SnUtil.validIso(o.optString("firstAt"), session.createdAt),
                SnUtil.validIso(o.optString("lastAt"), session.createdAt));
        item.format = o.optString("format", "");
        item.name = o.optString("name", "");
        item.category = SnUtil.normalizeCategory(o.optString("category"));
        item.qty = SnUtil.qty(o.optInt("qty", 1));
        item.location = o.optString("location", "");
        item.notes = o.optString("notes", "");
        item.scanCount = SnUtil.qty(o.optInt("scanCount", 1));
        boolean found = ScanItem.FOUND.equals(o.optString("status"));
        item.status = found ? ScanItem.FOUND : ScanItem.PENDING;
        String scannedAt = o.optString("scannedAt", "");
        item.scannedAt = found && !scannedAt.isEmpty() && !"null".equals(scannedAt) ? scannedAt : null;
        return item;
    }

    private void save() {
        try {
            JSONObject root = new JSONObject();
            root.put("version", VERSION);
            root.put("lastMode", lastMode);
            JSONArray array = new JSONArray();
            for (ScanSession session : sessions) array.put(writeSession(session));
            root.put("sessions", array);
            JSONObject ids = new JSONObject();
            ids.put("collect", activeIds[0] == null ? JSONObject.NULL : activeIds[0]);
            ids.put("match", activeIds[1] == null ? JSONObject.NULL : activeIds[1]);
            root.put("activeIds", ids);
            prefs.edit().putString(KEY_STATE, root.toString()).apply();
        } catch (Exception ignored) {
            // Keep the in-memory state usable even if serialization fails.
        }
    }

    private JSONObject writeSession(ScanSession session) throws Exception {
        JSONObject o = new JSONObject();
        o.put("id", session.id);
        o.put("mode", session.mode);
        o.put("name", session.name);
        o.put("notes", session.notes == null ? "" : session.notes);
        o.put("createdAt", session.createdAt);
        o.put("updatedAt", session.updatedAt);
        o.put("activeBrand", session.activeBrand);
        o.put("duplicateScans", session.duplicateScans);
        JSONArray items = new JSONArray();
        for (ScanItem item : session.items) {
            JSONObject i = new JSONObject();
            i.put("sn", item.sn);
            i.put("format", item.format == null ? "" : item.format);
            i.put("name", item.name == null ? "" : item.name);
            i.put("brand", item.brand);
            i.put("category", item.category);
            i.put("qty", item.qty);
            i.put("location", item.location == null ? "" : item.location);
            i.put("notes", item.notes == null ? "" : item.notes);
            i.put("firstAt", item.firstAt);
            i.put("lastAt", item.lastAt);
            i.put("scanCount", item.scanCount);
            i.put("status", item.status);
            if (item.scannedAt != null) i.put("scannedAt", item.scannedAt);
            else i.put("scannedAt", JSONObject.NULL);
            items.put(i);
        }
        o.put("items", items);
        JSONArray unmatched = new JSONArray();
        for (UnmatchedItem item : session.unmatched) {
            JSONObject u = new JSONObject();
            u.put("sn", item.sn);
            u.put("format", item.format == null ? "" : item.format);
            u.put("at", item.at);
            u.put("count", item.count);
            unmatched.put(u);
        }
        o.put("unmatched", unmatched);
        return o;
    }
}
