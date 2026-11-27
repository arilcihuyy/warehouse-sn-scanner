package io.github.arilcihuyy.snscanner;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.test.core.app.ApplicationProvider;

import com.journeyapps.barcodescanner.DecoratedBarcodeView;
import com.journeyapps.barcodescanner.Size;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class ActivitySmokeTest {
    @Test
    public void mainActivityInflates() {
        ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).setup();
        assertNotNull(controller.get().findViewById(R.id.scanCard));
        assertNotNull(controller.get().findViewById(R.id.inventoryCard));
        assertNotNull(controller.get().findViewById(R.id.manualCard));
        assertNotNull(controller.get().findViewById(R.id.homeGreeting));
        assertNotNull(controller.get().findViewById(R.id.homeSearchButton));
        assertNotNull(controller.get().findViewById(R.id.sessionCard));
        controller.pause().stop().destroy();
    }

    @Test
    public void inventoryActivityInflates() {
        ActivityController<InventoryActivity> controller =
                Robolectric.buildActivity(InventoryActivity.class).setup();
        assertNotNull(controller.get().findViewById(R.id.itemList));
        assertNotNull(controller.get().findViewById(R.id.searchInput));
        assertNotNull(controller.get().findViewById(R.id.filterAll));
        controller.pause().stop().destroy();
    }

    @Test
    public void sessionsActivityInflates() {
        ActivityController<SessionsActivity> controller =
                Robolectric.buildActivity(SessionsActivity.class).setup();
        assertNotNull(controller.get().findViewById(R.id.sessionList));
        assertNotNull(controller.get().findViewById(R.id.tabCollect));
        assertNotNull(controller.get().findViewById(R.id.newSessionButton));
        controller.pause().stop().destroy();
    }

    @Test
    public void settingsAndHelpInflate() {
        ActivityController<SettingsActivity> settings =
                Robolectric.buildActivity(SettingsActivity.class).setup();
        assertNotNull(settings.get().findViewById(R.id.soundToggle));
        settings.pause().stop().destroy();

        ActivityController<HelpActivity> help =
                Robolectric.buildActivity(HelpActivity.class).setup();
        assertNotNull(help.get().findViewById(R.id.backButton));
        help.pause().stop().destroy();
    }

    @Test
    public void scannerFrameIsRectangular() {
        ActivityController<ScannerActivity> controller =
                Robolectric.buildActivity(ScannerActivity.class).setup();
        DecoratedBarcodeView view = controller.get().findViewById(R.id.barcodeView);
        Size size = view.getBarcodeView().getFramingRectSize();
        assertNotNull(size);
        assertTrue("scanner frame must be a wide strip", size.width > size.height * 2.5);
        controller.pause().stop().destroy();
    }

    @Test
    public void storeRejectsDuplicateAcrossInstances() {
        Store store = Store.get(ApplicationProvider.getApplicationContext());
        ScanSession session = store.ensure(ScanSession.MODE_COLLECT);
        store.clear(session.id);
        SessionOps.Result first = SessionOps.addScan(session, "ZTEGC-SMOKE", null, SnUtil.nowIso());
        store.touch(session);
        assertEquals(SessionOps.Status.NEW, first.status);
        SessionOps.Result duplicate = SessionOps.addScan(session, "zte gc-smoke", null, SnUtil.nowIso());
        store.touch(session);
        assertEquals(SessionOps.Status.DUP, duplicate.status);
        assertEquals(1, store.active(ScanSession.MODE_COLLECT).items.size());
        store.clear(session.id);
    }

    @Test
    public void legacySnapshotMigratesWithoutLosingRecords() {
        Context context = ApplicationProvider.getApplicationContext();
        SharedPreferences prefs = context.getSharedPreferences("sn_scanner_native", Context.MODE_PRIVATE);
        String legacy = "{\"version\":1,\"match\":{\"createdAt\":\"2026-11-20T10:00:00.000Z\","
                + "\"items\":[{\"sn\":\"HWTC-OLD\",\"status\":\"found\",\"scannedAt\":\"2026-11-20T11:00:00.000Z\"},"
                + "{\"sn\":\"ZTE-OLD\",\"status\":\"pending\",\"scannedAt\":null}]},"
                + "\"collect\":{\"createdAt\":\"2026-11-19T09:00:00.000Z\",\"activeBrand\":\"auto\","
                + "\"items\":[{\"sn\":\"ZTEGC-OLD\",\"brand\":\"ZTE\",\"firstAt\":\"2026-11-19T09:01:00.000Z\",\"lastAt\":\"2026-11-19T09:01:00.000Z\"},"
                + "{\"sn\":\"ABC-OLD\",\"brand\":\"Lainnya\",\"firstAt\":\"2026-11-19T09:02:00.000Z\",\"lastAt\":\"2026-11-19T09:02:00.000Z\"}]}}";
        prefs.edit().clear().putString("state", legacy).commit();
        Store.resetForTests();

        Store store = Store.get(context);
        ScanSession collect = store.active(ScanSession.MODE_COLLECT);
        assertNotNull(collect);
        assertEquals("Scan Bebas (dipulihkan)", collect.name);
        assertEquals(2, collect.items.size());
        assertEquals("ZTEGC-OLD", collect.items.get(0).sn);
        ScanSession match = store.active(ScanSession.MODE_MATCH);
        assertNotNull(match);
        assertEquals("Cocokkan Daftar (dipulihkan)", match.name);
        assertEquals(2, match.items.size());
        assertEquals(1, match.foundCount());
        assertTrue(prefs.getString("state", "").contains("sessions"));
        assertTrue(prefs.getString("state_v1_backup", "").contains("\"version\":1"));
    }

    @Test
    public void sessionLifecycleKeepsActiveSemantics() {
        Context context = ApplicationProvider.getApplicationContext();
        context.getSharedPreferences("sn_scanner_native", Context.MODE_PRIVATE).edit().clear().commit();
        Store.resetForTests();
        Store store = Store.get(context);

        ScanSession created = store.create(ScanSession.MODE_COLLECT, "Sesi A");
        assertEquals(created.id, store.active(ScanSession.MODE_COLLECT).id);
        store.rename(created.id, "Sesi B");
        assertEquals("Sesi B", store.byId(created.id).name);
        store.create(ScanSession.MODE_COLLECT, "Sesi C");
        store.switchTo(created.id);
        assertEquals(created.id, store.active(ScanSession.MODE_COLLECT).id);
        assertTrue(store.remove(created.id));
        assertNull(store.byId(created.id));
        assertNotNull(store.active(ScanSession.MODE_COLLECT));
    }

    @Test
    public void inventoryListsActiveSessionItems() {
        Context context = ApplicationProvider.getApplicationContext();
        context.getSharedPreferences("sn_scanner_native", Context.MODE_PRIVATE).edit().clear().commit();
        Store.resetForTests();
        Store store = Store.get(context);
        ScanSession session = store.ensure(ScanSession.MODE_COLLECT);
        store.clear(session.id);
        SessionOps.addScan(session, "ZTEGC-WIRED", null, SnUtil.nowIso());
        store.touch(session);
        store.setLastMode(ScanSession.MODE_COLLECT);

        ActivityController<InventoryActivity> controller =
                Robolectric.buildActivity(InventoryActivity.class).setup();
        androidx.recyclerview.widget.RecyclerView list =
                controller.get().findViewById(R.id.itemList);
        assertNotNull(list.getAdapter());
        assertEquals(1, list.getAdapter().getItemCount());
        controller.pause().stop().destroy();
    }
}
