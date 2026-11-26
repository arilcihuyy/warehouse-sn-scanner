package io.github.arilcihuyy.snscanner;

import static org.junit.Assert.assertNotNull;

import androidx.test.core.app.ApplicationProvider;

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
        assertNotNull(controller.get().findViewById(R.id.matchCard));
        assertNotNull(controller.get().findViewById(R.id.collectCard));
        controller.pause().stop().destroy();
    }

    @Test
    public void matchActivityInflates() {
        ActivityController<MatchActivity> controller = Robolectric.buildActivity(MatchActivity.class).setup();
        assertNotNull(controller.get().findViewById(R.id.matchList));
        assertNotNull(controller.get().findViewById(R.id.scanButton));
        controller.pause().stop().destroy();
    }

    @Test
    public void collectActivityInflates() {
        ActivityController<CollectActivity> controller = Robolectric.buildActivity(CollectActivity.class).setup();
        assertNotNull(controller.get().findViewById(R.id.collectList));
        assertNotNull(controller.get().findViewById(R.id.chipAuto));
        controller.pause().stop().destroy();
    }

    @Test
    public void storeRejectsDuplicateAcrossInstances() {
        Store store = Store.get(ApplicationProvider.getApplicationContext());
        store.clearCollect();
        store.addCollect("ZTEGC-SMOKE", SnUtil.nowIso());
        SessionOps.AddResult duplicate = store.addCollect("zte gc-smoke", SnUtil.nowIso());
        assertNotNull(duplicate);
        org.junit.Assert.assertEquals(SessionOps.AddStatus.DUP, duplicate.status);
        org.junit.Assert.assertEquals(1, store.getCollect().items.size());
        store.clearCollect();
    }
}
