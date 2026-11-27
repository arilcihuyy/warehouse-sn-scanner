package io.github.arilcihuyy.snscanner;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageButton;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.ResultPoint;
import com.journeyapps.barcodescanner.BarcodeCallback;
import com.journeyapps.barcodescanner.BarcodeResult;
import com.journeyapps.barcodescanner.DecoratedBarcodeView;
import com.journeyapps.barcodescanner.DefaultDecoderFactory;
import com.journeyapps.barcodescanner.Size;

import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import android.util.DisplayMetrics;

public class ScannerActivity extends AppCompatActivity {
    public static final String EXTRA_MODE = "mode";
    public static final String MODE_MATCH = "match";
    public static final String MODE_COLLECT = "collect";

    private static final long SCAN_COOLDOWN_MS = 1500L;
    private static final int CAMERA_REQUEST = 71;

    private DecoratedBarcodeView barcodeView;
    private TextView hint;
    private TextView count;
    private ImageButton torch;
    private String mode;
    private Store store;
    private ToneGenerator tone;
    private long lastScanAt;
    private boolean torchOn;
    private boolean cameraStarted;
    private int hintToken;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private final BarcodeCallback callback = new BarcodeCallback() {
        @Override
        public void barcodeResult(BarcodeResult result) {
            if (result == null) return;
            handleScan(result.getText());
        }

        @Override
        public void possibleResultPoints(List<ResultPoint> resultPoints) {
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setContentView(R.layout.activity_scanner);
        store = Store.get(this);
        mode = getIntent().getStringExtra(EXTRA_MODE);
        if (mode == null) mode = MODE_COLLECT;

        barcodeView = findViewById(R.id.barcodeView);
        hint = findViewById(R.id.scanHint);
        count = findViewById(R.id.scannerCount);
        torch = findViewById(R.id.torchButton);
        TextView title = findViewById(R.id.scannerTitle);
        title.setText(MODE_MATCH.equals(mode) ? R.string.scanner_title_match : R.string.scanner_title_collect);
        barcodeView.getBarcodeView().setFramingRectSize(scanFrameSize());

        findViewById(R.id.closeButton).setOnClickListener(v -> finish());
        torch.setOnClickListener(v -> toggleTorch());

        Collection<BarcodeFormat> formats = Arrays.asList(
                BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93,
                BarcodeFormat.ITF, BarcodeFormat.CODABAR, BarcodeFormat.EAN_13,
                BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
                BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX, BarcodeFormat.AZTEC);
        barcodeView.getBarcodeView().setDecoderFactory(new DefaultDecoderFactory(formats));
        barcodeView.setStatusText("");
        barcodeView.decodeContinuous(callback);
        try {
            tone = new ToneGenerator(AudioManager.STREAM_MUSIC, 80);
        } catch (Exception e) {
            tone = null;
        }
        updateCounter();
        ensurePermission();
    }

    private void ensurePermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_REQUEST);
        }
    }

    /** A thin strip, not the library's default square. */
    private Size scanFrameSize() {
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        int width = Math.min(Math.round(metrics.widthPixels * 0.84f),
                Math.round(360 * metrics.density));
        int minHeight = Math.round(70 * metrics.density);
        int maxHeight = Math.round(104 * metrics.density);
        int height = Math.round(metrics.heightPixels * 0.11f);
        height = Math.max(minHeight, Math.min(maxHeight, height));
        return new Size(width, height);
    }

    private void startCamera() {
        try {
            barcodeView.resume();
            cameraStarted = true;
        } catch (Exception e) {
            Toast.makeText(this, R.string.camera_error, Toast.LENGTH_LONG).show();
            finish();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!cameraStarted && ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED) {
            startCamera();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        barcodeView.pause();
        cameraStarted = false;
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        handler.removeCallbacksAndMessages(null);
        if (tone != null) {
            tone.release();
            tone = null;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != CAMERA_REQUEST) return;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            startCamera();
        } else {
            showPermissionDialog();
        }
    }

    private void showPermissionDialog() {
        new MaterialAlertDialogBuilder(this)
                .setTitle(R.string.camera_permission_title)
                .setMessage(R.string.camera_permission_body)
                .setCancelable(false)
                .setNegativeButton(R.string.close, (d, w) -> finish())
                .setPositiveButton("Pengaturan", (d, w) -> {
                    Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                    finish();
                })
                .show();
    }

    private void toggleTorch() {
        try {
            if (torchOn) {
                barcodeView.setTorchOff();
            } else {
                barcodeView.setTorchOn();
            }
            torchOn = !torchOn;
            torch.setAlpha(torchOn ? 1f : 0.55f);
        } catch (Exception e) {
            Toast.makeText(this, R.string.camera_error, Toast.LENGTH_SHORT).show();
        }
    }

    private void handleScan(String raw) {
        long now = SystemClock.elapsedRealtime();
        if (now - lastScanAt < SCAN_COOLDOWN_MS) return;
        lastScanAt = now;

        String text = SnUtil.clean(raw);
        if (text.isEmpty()) {
            showHint(getString(R.string.scanner_invalid), Color.WHITE);
            return;
        }

        if (MODE_MATCH.equals(mode)) {
            SessionOps.MatchResult result = store.markFound(text, SnUtil.nowIso());
            if (result.status == SessionOps.MatchStatus.FOUND) {
                beep(false);
                vibrate(80);
                showHint(getString(R.string.scanner_found, result.sn), Color.parseColor("#7EE2B0"));
            } else if (result.status == SessionOps.MatchStatus.ALREADY) {
                beep(true);
                vibrate(50);
                showHint(getString(R.string.scanner_already_found, result.sn), Color.parseColor("#FFD27A"));
            } else {
                beep(true);
                vibrate(50);
                showHint(getString(R.string.scanner_not_target, result.sn), Color.parseColor("#FFD27A"));
            }
        } else {
            SessionOps.AddResult result = store.addCollect(text, SnUtil.nowIso());
            if (result.status == SessionOps.AddStatus.ADDED) {
                beep(false);
                vibrate(90);
                showHint(getString(R.string.scanner_saved, result.item.sn), Color.parseColor("#7EE2B0"));
            } else if (result.status == SessionOps.AddStatus.DUP) {
                beep(true);
                vibrate(50);
                showHint(getString(R.string.scanner_duplicate, result.item.sn), Color.parseColor("#FFD27A"));
            } else {
                showHint(getString(R.string.scanner_invalid), Color.WHITE);
            }
        }
        updateCounter();
    }

    private void updateCounter() {
        if (MODE_MATCH.equals(mode)) {
            MatchSession session = store.getMatch();
            int remaining = session == null ? 0 : session.remainingCount();
            count.setText(remaining + " sisa");
        } else {
            CollectSession session = store.getCollect();
            int total = session == null ? 0 : session.items.size();
            count.setText(total + " SN");
        }
    }

    private void showHint(String text, int color) {
        final int token = ++hintToken;
        hint.setText(text);
        hint.setTextColor(color);
        hint.setVisibility(View.VISIBLE);
        handler.postDelayed(() -> {
            if (token != hintToken) return;
            hint.setText(R.string.scanner_hint);
            hint.setTextColor(Color.WHITE);
        }, 2600);
    }

    private void beep(boolean duplicate) {
        if (tone == null) return;
        try {
            tone.startTone(ToneGenerator.TONE_PROP_BEEP, 70);
            if (duplicate) {
                handler.postDelayed(() -> {
                    if (tone != null) tone.startTone(ToneGenerator.TONE_PROP_BEEP, 70);
                }, 130);
            }
        } catch (Exception ignored) {
        }
    }

    private void vibrate(int ms) {
        Vibrator vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                vibrator.vibrate(ms);
            }
        } catch (Exception ignored) {
        }
    }
}
