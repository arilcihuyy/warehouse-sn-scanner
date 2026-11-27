package io.github.arilcihuyy.snscanner;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

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
        assertNotNull(controller.get().findViewById(R.id.matchCard));
        assertNotNull(controller.get().findViewById(R.id.collectCard));
        assertNotNull(controller.get().findViewById(R.id.homeGreeting));
        assertNotNull(controller.get().findViewById(R.id.homeSearchButton));
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
    public void scannerFrameIsRectangular() {
        ActivityController<ScannerActivity> controller = Robolectric.buildActivity(ScannerActivity.class).setup();
        DecoratedBarcodeView view = controller.get().findViewById(R.id.barcodeView);
        Size size = view.getBarcodeView().getFramingRectSize();
        assertNotNull(size);
        assertTrue("scanner frame must be a wide strip", size.width > size.height * 2.5);
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
