package io.github.arilcihuyy.snscanner;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Small JSON-backed store. All data stays on the device. */
public final class Store {
    private static final String PREFS = "sn_scanner_native";
    private static final String KEY_STATE = "state";

    private static Store instance;

    private final SharedPreferences prefs;
    private MatchSession match;
    private CollectSession collect;

    private Store(Context context) {
        prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        load();
    }

    public static synchronized Store get(Context context) {
        if (instance == null) instance = new Store(context);
        return instance;
    }

    public synchronized MatchSession getMatch() {
        return match;
    }

    public synchronized CollectSession getCollect() {
        return collect;
    }

    public synchronized CollectSession ensureCollect() {
        if (collect == null) {
            collect = new CollectSession();
            collect.createdAt = SnUtil.nowIso();
            save();
        }
        return collect;
    }

    public synchronized String getActiveBrand() {
        return collect == null ? SnUtil.BRAND_AUTO : collect.activeBrand;
    }

    public synchronized void setActiveBrand(String brand) {
        CollectSession session = ensureCollect();
        session.activeBrand = SnUtil.isAutoBrand(brand) ? SnUtil.BRAND_AUTO : SnUtil.normalizeBrand(brand);
        save();
    }

    public synchronized MatchSession createMatch(List<String> values) {
        MatchSession session = new MatchSession();
        session.createdAt = SnUtil.nowIso();
        Set<String> seen = new LinkedHashSet<>();
        for (String value : values) {
            String sn = SnUtil.clean(value);
            String key = SnUtil.key(sn);
            if (key.isEmpty() || !seen.add(key)) continue;
            session.items.add(new MatchItem(sn, MatchItem.PENDING, null));
        }
        match = session;
        save();
        return session;
    }

    public synchronized SessionOps.MatchResult markFound(String raw, String at) {
        if (match == null) return new SessionOps.MatchResult(SessionOps.MatchStatus.NOT_TARGET, -1, SnUtil.clean(raw));
        SessionOps.MatchResult result = SessionOps.markFound(match, raw, at);
        if (result.status == SessionOps.MatchStatus.FOUND) save();
        return result;
    }

    public synchronized boolean toggleMatch(int index) {
        if (match == null) return false;
        boolean changed = SessionOps.toggleMatch(match, index, SnUtil.nowIso());
        if (changed) save();
        return changed;
    }

    public synchronized void clearMatch() {
        match = null;
        save();
    }

    public synchronized SessionOps.AddResult addCollect(String raw, String at) {
        CollectSession session = ensureCollect();
        return addCollect(raw, session.activeBrand, at);
    }

    public synchronized SessionOps.AddResult addCollect(String raw, String brand, String at) {
        CollectSession session = ensureCollect();
        SessionOps.AddResult result = SessionOps.addCollect(session, raw, brand, at);
        if (result.status == SessionOps.AddStatus.ADDED) save();
        return result;
    }

    public synchronized SessionOps.UpdateResult updateCollect(int index, String raw, String brand) {
        if (collect == null) return new SessionOps.UpdateResult(SessionOps.UpdateStatus.INVALID, index);
        SessionOps.UpdateResult result = SessionOps.updateCollect(collect, index, raw, brand, SnUtil.nowIso());
        if (result.status == SessionOps.UpdateStatus.UPDATED) save();
        return result;
    }

    public synchronized boolean deleteCollect(int index) {
        if (collect == null) return false;
        boolean changed = SessionOps.deleteCollect(collect, index);
        if (changed) save();
        return changed;
    }

    public synchronized void clearCollect() {
        collect = null;
        save();
    }

    private void load() {
        String raw = prefs.getString(KEY_STATE, null);
        if (raw == null) return;
        try {
            JSONObject root = new JSONObject(raw);
            JSONObject matchJson = root.optJSONObject("match");
            if (matchJson != null) {
                MatchSession session = new MatchSession();
                session.createdAt = matchJson.optString("createdAt", SnUtil.nowIso());
                JSONArray items = matchJson.optJSONArray("items");
                if (items != null) {
                    for (int i = 0; i < items.length(); i++) {
                        JSONObject o = items.optJSONObject(i);
                        if (o == null) continue;
                        String sn = SnUtil.clean(o.optString("sn", ""));
                        if (sn.isEmpty()) continue;
                        String status = MatchItem.FOUND.equals(o.optString("status")) ? MatchItem.FOUND : MatchItem.PENDING;
                        String scannedAt = o.optString("scannedAt", null);
                        if (scannedAt != null && scannedAt.equals("null")) scannedAt = null;
                        session.items.add(new MatchItem(sn, status, scannedAt));
                    }
                }
                if (!session.items.isEmpty()) match = session;
            }
            JSONObject collectJson = root.optJSONObject("collect");
            if (collectJson != null) {
                CollectSession session = new CollectSession();
                session.createdAt = collectJson.optString("createdAt", SnUtil.nowIso());
                session.activeBrand = SnUtil.isAutoBrand(collectJson.optString("activeBrand"))
                        ? SnUtil.BRAND_AUTO : SnUtil.normalizeBrand(collectJson.optString("activeBrand"));
                JSONArray items = collectJson.optJSONArray("items");
                if (items != null) {
                    Set<String> seen = new LinkedHashSet<>();
                    for (int i = 0; i < items.length(); i++) {
                        JSONObject o = items.optJSONObject(i);
                        if (o == null) continue;
                        String sn = SnUtil.clean(o.optString("sn", ""));
                        String key = SnUtil.key(sn);
                        if (key.isEmpty() || !seen.add(key)) continue;
                        String brand = o.optString("brand", "");
                        if (brand.isEmpty()) brand = SnUtil.guessBrand(sn);
                        else brand = SnUtil.normalizeBrand(brand);
                        String firstAt = o.optString("firstAt", session.createdAt);
                        String lastAt = o.optString("lastAt", firstAt);
                        session.items.add(new CollectItem(sn, brand, firstAt, lastAt));
                    }
                }
                if (!session.items.isEmpty()) collect = session;
            }
        } catch (Exception ignored) {
            match = null;
            collect = null;
        }
    }

    private void save() {
        try {
            JSONObject root = new JSONObject();
            root.put("version", 1);
            if (match != null) {
                JSONObject m = new JSONObject();
                m.put("createdAt", match.createdAt);
                JSONArray items = new JSONArray();
                for (MatchItem item : match.items) {
                    JSONObject o = new JSONObject();
                    o.put("sn", item.sn);
                    o.put("status", item.status);
                    if (item.scannedAt != null) o.put("scannedAt", item.scannedAt);
                    else o.put("scannedAt", JSONObject.NULL);
                    items.put(o);
                }
                m.put("items", items);
                root.put("match", m);
            }
            if (collect != null) {
                JSONObject c = new JSONObject();
                c.put("createdAt", collect.createdAt);
                c.put("activeBrand", collect.activeBrand);
                JSONArray items = new JSONArray();
                for (CollectItem item : collect.items) {
                    JSONObject o = new JSONObject();
                    o.put("sn", item.sn);
                    o.put("brand", item.brand);
                    o.put("firstAt", item.firstAt);
                    o.put("lastAt", item.lastAt);
                    items.put(o);
                }
                c.put("items", items);
                root.put("collect", c);
            }
            prefs.edit().putString(KEY_STATE, root.toString()).apply();
        } catch (Exception ignored) {
            // Keep the in-memory state usable even if serialization fails.
        }
    }
}
