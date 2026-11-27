package io.github.arilcihuyy.snscanner;

import android.Manifest;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Matrix;
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
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.text.Editable;
import android.text.TextWatcher;
import android.util.DisplayMetrics;
import android.view.LayoutInflater;
import android.view.View;
import android.view.WindowManager;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.core.content.ContextCompat;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.RGBLuminanceSource;
import com.google.zxing.ResultPoint;
import com.google.zxing.common.HybridBinarizer;
import com.journeyapps.barcodescanner.BarcodeCallback;
import com.journeyapps.barcodescanner.BarcodeResult;
import com.journeyapps.barcodescanner.DecoratedBarcodeView;
import com.journeyapps.barcodescanner.DefaultDecoderFactory;
import com.journeyapps.barcodescanner.Size;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Date;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class ScannerActivity extends BaseActivity implements ScanAdapter.Listener {
    public static final String EXTRA_MODE = "mode";
    public static final String MODE_MATCH = ScanSession.MODE_MATCH;
    public static final String MODE_COLLECT = ScanSession.MODE_COLLECT;

    private static final long SCAN_COOLDOWN_MS = 1500L;
    private static final int CAMERA_REQUEST = 71;

    private DecoratedBarcodeView barcodeView;
    private TextView hint;
    private TextView scanStatus;
    private TextView scanValue;
    private TextView scanMeta;
    private TextView scanTime;
    private TextView sessionCount;
    private TextView sessionSub;
    private TextView openDetail;
    private TextView modeCollectTab;
    private TextView modeMatchTab;
    private TextView scanEmpty;
    private View brandScroll;
    private LinearLayout brandChips;
    private ImageButton torch;
    private ImageButton importButton;
    private EditText search;
    private ImageButton searchClear;

    private Store store;
    private ScanSession session;
    private ScanAdapter adapter;
    private String mode;
    private String scanQuery = "";
    private String lastSn;
    private ToneGenerator tone;
    private boolean torchOn;
    private boolean cameraStarted;
    private int hintToken;
    private final Map<String, Long> cooldown = new HashMap<>();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private ActivityResultLauncher<String[]> openDocument;
    private ActivityResultLauncher<String> pickImage;

    private final BarcodeCallback callback = new BarcodeCallback() {
        @Override
        public void barcodeResult(BarcodeResult result) {
            if (result == null) return;
            String format = result.getBarcodeFormat() == null ? "" : result.getBarcodeFormat().name();
            handleScan(result.getText(), format);
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
        if (mode == null) mode = store.lastMode();
        session = store.active(mode);
        if (session == null) session = store.ensure(mode);

        barcodeView = findViewById(R.id.barcodeView);
        hint = findViewById(R.id.scanHint);
        scanStatus = findViewById(R.id.scanStatus);
        scanValue = findViewById(R.id.scanValue);
        scanMeta = findViewById(R.id.scanMeta);
        scanTime = findViewById(R.id.scanTime);
        sessionCount = findViewById(R.id.sessionCount);
        sessionSub = findViewById(R.id.sessionSub);
        openDetail = findViewById(R.id.openDetail);
        modeCollectTab = findViewById(R.id.modeCollectTab);
        modeMatchTab = findViewById(R.id.modeMatchTab);
        scanEmpty = findViewById(R.id.scanEmpty);
        brandScroll = findViewById(R.id.brandScroll);
        brandChips = findViewById(R.id.brandChips);
        torch = findViewById(R.id.torchButton);
        importButton = findViewById(R.id.importButton);
        search = findViewById(R.id.scanSearch);
        searchClear = findViewById(R.id.scanSearchClear);

        RecyclerView list = findViewById(R.id.scanList);
        list.setLayoutManager(new LinearLayoutManager(this));
        adapter = new ScanAdapter(this);
        list.setAdapter(adapter);

        openDocument = registerForActivityResult(new ActivityResultContracts.OpenDocument(),
                this::onFileSelected);
        pickImage = registerForActivityResult(new ActivityResultContracts.GetContent(),
                this::onImagePicked);

        findViewById(R.id.closeButton).setOnClickListener(v -> finish());
        findViewById(R.id.imageButton).setOnClickListener(v -> pickImage.launch("image/*"));
        findViewById(R.id.exportButton).setOnClickListener(v -> exportOrRekap());
        findViewById(R.id.addButton).setOnClickListener(v ->
                EditItemDialog.show(this, store, session, null, this::refreshAll));
        findViewById(R.id.importButton).setOnClickListener(v -> confirmReplace(this::showImportSource));
        findViewById(R.id.openDetail).setOnClickListener(v -> openLastDetail());
        torch.setOnClickListener(v -> toggleTorch());
        modeCollectTab.setOnClickListener(v -> switchMode(MODE_COLLECT));
        modeMatchTab.setOnClickListener(v -> switchMode(MODE_MATCH));
        searchClear.setOnClickListener(v -> {
            search.setText("");
            scanQuery = "";
            refreshAll();
        });
        search.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {
            }

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                scanQuery = s.toString();
                refreshList();
            }

            @Override
            public void afterTextChanged(Editable s) {
            }
        });

        barcodeView.getBarcodeView().setFramingRectSize(scanFrameSize());
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
        refreshAll();
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
        ScanSession active = store.active(mode);
        if (active != null) session = active;
        refreshAll();
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
                .setPositiveButton(R.string.settings, (d, w) -> {
                    Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                    finish();
                })
                .show();
    }

    private void toggleTorch() {
        try {
            if (torchOn) barcodeView.setTorchOff();
            else barcodeView.setTorchOn();
            torchOn = !torchOn;
            torch.setAlpha(torchOn ? 1f : 0.55f);
        } catch (Exception e) {
            Toast.makeText(this, R.string.camera_error, Toast.LENGTH_SHORT).show();
        }
    }

    private void switchMode(String next) {
        if (next.equals(mode)) return;
        mode = next;
        store.setLastMode(mode);
        session = store.ensure(mode);
        scanQuery = "";
        search.setText("");
        resetResult();
        refreshAll();
    }

    private void handleScan(String raw, String format) {
        String text = SnUtil.clean(raw);
        String key = SnUtil.key(text);
        if (key.isEmpty()) {
            showHint(getString(R.string.scanner_invalid), Color.WHITE);
            return;
        }
        long now = SystemClock.elapsedRealtime();
        Long previous = cooldown.get(key);
        if (previous != null && now - previous < SCAN_COOLDOWN_MS) return;
        cooldown.put(key, now);
        if (cooldown.size() > 500) cooldown.clear();

        SessionOps.Meta meta = new SessionOps.Meta();
        meta.format = format == null ? "" : format;
        SessionOps.Result result = SessionOps.addScan(session, text, meta, SnUtil.nowIso());
        if (result.status != SessionOps.Status.INVALID) store.touch(session);

        updateResultCard(result, text);
        feedback(result.status);
        refreshAll();
    }

    private void updateResultCard(SessionOps.Result result, String text) {
        ScanItem item = result.item;
        String sn = item != null ? item.sn : text;
        switch (result.status) {
            case NEW:
                setStatus(getString(R.string.scanner_saved), R.drawable.bg_badge_found, R.color.success);
                break;
            case MATCHED:
                setStatus(getString(R.string.scanner_matched), R.drawable.bg_badge_found, R.color.success);
                break;
            case DUP:
            case ALREADY:
            case UNMATCHED_DUP:
                setStatus(getString(R.string.scanner_duplicate), R.drawable.bg_badge_pending, R.color.warning);
                break;
            case UNMATCHED:
                setStatus(getString(R.string.scanner_unmatched), R.drawable.bg_badge_pending, R.color.warning);
                break;
            default:
                setStatus(getString(R.string.scanner_invalid), R.drawable.bg_badge_neutral, R.color.ink_soft);
                break;
        }
        scanValue.setText(sn);
        scanTime.setText(new SimpleDateFormat("HH:mm", Locale.US).format(new Date()));
        List<String> details = new ArrayList<>();
        if (item != null) {
            if (item.brand != null && !item.brand.isEmpty()) details.add(item.brand);
            if (item.qty > 0) details.add(getString(R.string.unit_format, item.qty));
        }
        if (result.status == SessionOps.Status.DUP) details.add(getString(R.string.scan_result_dup_note));
        if (result.status == SessionOps.Status.UNMATCHED) details.add(getString(R.string.scan_result_unmatched_note));
        scanMeta.setText(details.isEmpty() ? getString(R.string.scan_result_empty) : SnUtil.join(details, " · "));
        boolean openable = result.status == SessionOps.Status.NEW || result.status == SessionOps.Status.MATCHED;
        openDetail.setVisibility(openable ? View.VISIBLE : View.GONE);
        if (openable) lastSn = sn;

        int color;
        switch (result.status) {
            case NEW:
            case MATCHED:
                color = Color.parseColor("#7EE2B0");
                break;
            case DUP:
            case ALREADY:
            case UNMATCHED_DUP:
                color = Color.parseColor("#FFD27A");
                break;
            case UNMATCHED:
                color = Color.parseColor("#FFD27A");
                break;
            default:
                color = Color.WHITE;
                break;
        }
        String label;
        if (result.status == SessionOps.Status.NEW) label = getString(R.string.scanner_saved) + ": " + sn;
        else if (result.status == SessionOps.Status.MATCHED) label = getString(R.string.scanner_matched) + ": " + sn;
        else if (result.status == SessionOps.Status.ALREADY) label = getString(R.string.scanner_already) + ": " + sn;
        else if (result.status == SessionOps.Status.DUP) label = getString(R.string.scanner_duplicate) + ": " + sn;
        else if (result.status == SessionOps.Status.UNMATCHED
                || result.status == SessionOps.Status.UNMATCHED_DUP) {
            label = getString(R.string.scanner_unmatched) + ": " + sn;
        } else label = getString(R.string.scanner_invalid);
        showHint(label, color);
    }

    private void setStatus(String text, int background, int color) {
        scanStatus.setText(text);
        scanStatus.setBackgroundResource(background);
        scanStatus.setTextColor(ContextCompat.getColor(this, color));
    }

    private void resetResult() {
        setStatus(getString(R.string.scanner_ready), R.drawable.bg_badge_neutral, R.color.ink_soft);
        scanValue.setText("-");
        scanMeta.setText(R.string.scan_result_empty);
        scanTime.setText("");
        openDetail.setVisibility(View.GONE);
    }

    private void feedback(SessionOps.Status status) {
        boolean duplicate = status == SessionOps.Status.DUP || status == SessionOps.Status.ALREADY
                || status == SessionOps.Status.UNMATCHED_DUP;
        if (store.soundEnabled()) beep(duplicate, status == SessionOps.Status.UNMATCHED);
        if (store.vibrationEnabled()) vibrate(duplicate ? 50 : 80);
    }

    private void beep(boolean duplicate, boolean low) {
        if (tone == null) return;
        try {
            if (low) {
                tone.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 90);
                return;
            }
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

    private void refreshAll() {
        TextView title = findViewById(R.id.scannerTitle);
        TextView date = findViewById(R.id.scannerDate);
        title.setText(session.isMatch() ? R.string.mode_match_title : R.string.mode_collect_title);
        date.setText(new SimpleDateFormat("d MMM", new Locale("id", "ID")).format(new Date()));

        SessionOps.Summary summary = SessionOps.summary(session);
        sessionCount.setText(String.valueOf(summary.unique));
        sessionSub.setText(session.isMatch()
                ? getString(R.string.scanner_summary_match, summary.matched, summary.remaining)
                : getString(R.string.scanner_summary_collect, session.brandCount(), summary.totalScans));
        com.google.android.material.button.MaterialButton export =
                findViewById(R.id.exportButton);
        export.setText(session.isMatch()
                ? getString(R.string.rekap) + " · " + getString(R.string.scanner_export_sub_match,
                summary.matched, summary.unique)
                : getString(R.string.export) + " · " + getString(R.string.scanner_export_sub_collect, summary.unique));

        styleModeTabs();
        importButton.setVisibility(session.isMatch() ? View.VISIBLE : View.GONE);
        brandScroll.setVisibility(session.isMatch() ? View.GONE : View.VISIBLE);
        renderBrandChips();
        searchClear.setVisibility(scanQuery.isEmpty() ? View.GONE : View.VISIBLE);
        refreshList();
    }

    private void styleModeTabs() {
        boolean collect = !session.isMatch();
        modeCollectTab.setBackgroundResource(collect ? R.drawable.bg_segment_active : 0);
        modeCollectTab.setTextColor(ContextCompat.getColor(this, collect ? R.color.ink : R.color.ink_faint));
        modeCollectTab.setTypeface(null, collect ? android.graphics.Typeface.BOLD : android.graphics.Typeface.NORMAL);
        modeMatchTab.setBackgroundResource(collect ? 0 : R.drawable.bg_segment_active);
        modeMatchTab.setTextColor(ContextCompat.getColor(this, collect ? R.color.ink_faint : R.color.ink));
        modeMatchTab.setTypeface(null, collect ? android.graphics.Typeface.NORMAL : android.graphics.Typeface.BOLD);
    }

    private void renderBrandChips() {
        brandChips.removeAllViews();
        List<String> brands = new ArrayList<>();
        brands.add(SnUtil.BRAND_AUTO);
        brands.addAll(Arrays.asList(SnUtil.BRANDS));
        for (String brand : brands) {
            TextView chip = new TextView(this);
            boolean active = brand.equals(session.activeBrand)
                    || (SnUtil.isAutoBrand(brand) && SnUtil.isAutoBrand(session.activeBrand));
            chip.setText(SnUtil.isAutoBrand(brand) ? getString(R.string.brand_auto) : brand);
            chip.setTextSize(11.5f);
            chip.setTextColor(ContextCompat.getColor(this, active ? R.color.white : R.color.ink_soft));
            chip.setBackgroundResource(active ? R.drawable.bg_chip_active : R.drawable.bg_chip);
            int padH = Math.round(11 * getResources().getDisplayMetrics().density);
            int padV = Math.round(6 * getResources().getDisplayMetrics().density);
            chip.setPadding(padH, padV, padH, padV);
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            params.setMarginEnd(Math.round(6 * getResources().getDisplayMetrics().density));
            chip.setLayoutParams(params);
            chip.setOnClickListener(v -> {
                session.activeBrand = SnUtil.isAutoBrand(brand) ? SnUtil.BRAND_AUTO : brand;
                store.touch(session);
                renderBrandChips();
            });
            brandChips.addView(chip);
        }
    }

    private void refreshList() {
        List<ScanItem> filtered = SessionOps.filter(session.items, scanQuery, "", false, false,
                "newest", SessionOps.startOfToday());
        adapter.submit(filtered, session.isMatch());
        boolean empty = filtered.isEmpty();
        scanEmpty.setVisibility(empty ? View.VISIBLE : View.GONE);
        findViewById(R.id.scanList).setVisibility(empty ? View.GONE : View.VISIBLE);
        scanEmpty.setText(scanQuery.isEmpty() ? R.string.scan_empty : R.string.scan_empty_search);
    }

    private void openLastDetail() {
        ScanItem item = lastSn == null ? null : session.bySn(lastSn);
        if (item == null) return;
        ItemDetailDialog.show(this, store, session, item, this::refreshAll, null);
    }

    private void exportOrRekap() {
        if (session.isMatch()) showMatchRecap();
        else showExportSheet(session, this::refreshAll);
    }

    private void showMatchRecap() {
        SessionOps.Summary summary = SessionOps.summary(session);
        StringBuilder message = new StringBuilder();
        message.append(getString(R.string.found)).append(": ").append(summary.matched)
                .append("  ·  ").append(getString(R.string.remaining)).append(": ").append(summary.remaining)
                .append("  ·  ").append(getString(R.string.scanner_unmatched)).append(": ").append(summary.unmatched)
                .append("\n\n").append(getString(R.string.rekap_left)).append('\n');
        int shown = 0;
        for (ScanItem item : session.items) {
            if (item.isFound()) continue;
            if (shown++ >= 40) {
                message.append("…\n");
                break;
            }
            message.append("• ").append(item.sn).append('\n');
        }
        if (summary.remaining == 0) message.append(getString(R.string.rekap_none_left)).append('\n');
        message.append('\n').append(getString(R.string.rekap_unmatched)).append('\n');
        shown = 0;
        for (UnmatchedItem item : session.unmatched) {
            if (shown++ >= 40) {
                message.append("…\n");
                break;
            }
            message.append("• ").append(item.sn).append(" (").append(item.count).append("×)\n");
        }
        if (summary.unmatched == 0) message.append(getString(R.string.rekap_none_unmatched));

        new MaterialAlertDialogBuilder(this)
                .setTitle(R.string.rekap_title)
                .setMessage(message.toString())
                .setNegativeButton(R.string.close, null)
                .setNeutralButton(R.string.copy_report, (d, w) -> copyReport())
                .setPositiveButton(R.string.export, (d, w) -> showExportSheet(session, this::refreshAll))
                .show();
    }

    private void copyReport() {
        SessionOps.Summary summary = SessionOps.summary(session);
        StringBuilder b = new StringBuilder();
        b.append("*LAPORAN STOCKSCAN*\n");
        b.append("Sesi: ").append(session.name).append('\n');
        b.append("Tanggal: ").append(SnUtil.formatTime(SnUtil.nowIso())).append('\n');
        b.append("Total scan: ").append(summary.totalScans).append('\n');
        b.append("Unik: ").append(summary.unique).append('\n');
        b.append("Duplikat: ").append(summary.duplicates).append('\n');
        b.append("Ketemu: ").append(summary.matched).append('\n');
        b.append("Sisa: ").append(summary.remaining).append('\n');
        b.append("\n*BELUM KETEMU (").append(summary.remaining).append(")*\n");
        for (ScanItem item : session.items) {
            if (!item.isFound()) b.append("- ").append(item.sn).append('\n');
        }
        b.append("\n*TIDAK COCOK (").append(summary.unmatched).append(")*\n");
        for (UnmatchedItem item : session.unmatched) b.append("- ").append(item.sn).append('\n');
        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard != null) {
            clipboard.setPrimaryClip(ClipData.newPlainText("laporan", b.toString()));
            Toast.makeText(this, R.string.report_copied, Toast.LENGTH_SHORT).show();
        }
    }

    private void confirmReplace(Runnable next) {
        if (session.items.isEmpty()) {
            next.run();
            return;
        }
        new MaterialAlertDialogBuilder(this)
                .setTitle(R.string.replace_list_title)
                .setMessage(R.string.replace_list_body)
                .setNegativeButton(R.string.cancel, null)
                .setPositiveButton(R.string.continue_label, (d, w) -> next.run())
                .show();
    }

    private void showImportSource() {
        new MaterialAlertDialogBuilder(this)
                .setTitle(R.string.import_list)
                .setItems(new String[]{getString(R.string.import_file), getString(R.string.paste_list)},
                        (d, which) -> {
                            if (which == 0) {
                                openDocument.launch(new String[]{"text/*", "text/csv",
                                        "application/csv", "application/vnd.ms-excel",
                                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                        "*/*"});
                            } else {
                                showPasteDialog();
                            }
                        })
                .setNegativeButton(R.string.cancel, null)
                .show();
    }

    private void showPasteDialog() {
        View view = LayoutInflater.from(this).inflate(R.layout.dialog_paste, null);
        EditText input = view.findViewById(R.id.pasteInput);
        AlertDialog dialog = new MaterialAlertDialogBuilder(this).setView(view).create();
        view.findViewById(R.id.pasteCancel).setOnClickListener(v -> dialog.dismiss());
        view.findViewById(R.id.pasteImport).setOnClickListener(v -> {
            String text = input.getText() == null ? "" : input.getText().toString();
            dialog.dismiss();
            applyImport(ImportParser.parse(text));
        });
        dialog.show();
    }

    private void onImagePicked(Uri uri) {
        if (uri == null) return;
        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            try (InputStream in = getContentResolver().openInputStream(uri)) {
                BitmapFactory.decodeStream(in, null, bounds);
            }
            int sample = 1;
            int max = Math.max(bounds.outWidth, bounds.outHeight);
            while (max / sample > 2200) sample *= 2;
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = sample;
            Bitmap bitmap;
            try (InputStream in = getContentResolver().openInputStream(uri)) {
                bitmap = BitmapFactory.decodeStream(in, null, options);
            }
            if (bitmap == null) {
                Toast.makeText(this, R.string.image_failed, Toast.LENGTH_SHORT).show();
                return;
            }
            com.google.zxing.Result decoded = decodeBitmap(bitmap);
            if (decoded == null) {
                Toast.makeText(this, R.string.image_empty, Toast.LENGTH_SHORT).show();
                return;
            }
            String format = decoded.getBarcodeFormat() == null ? "" : decoded.getBarcodeFormat().name();
            handleScan(decoded.getText(), format);
        } catch (Exception e) {
            Toast.makeText(this, R.string.image_failed, Toast.LENGTH_SHORT).show();
        }
    }

    /** Try the four upright orientations; gallery photos are often rotated. */
    private com.google.zxing.Result decodeBitmap(Bitmap bitmap) {
        for (int rotation = 0; rotation < 360; rotation += 90) {
            Bitmap current = rotation == 0 ? bitmap : rotate(bitmap, rotation);
            try {
                int width = current.getWidth();
                int height = current.getHeight();
                int[] pixels = new int[width * height];
                current.getPixels(pixels, 0, width, 0, 0, width, height);
                RGBLuminanceSource source = new RGBLuminanceSource(width, height, pixels);
                BinaryBitmap binary = new BinaryBitmap(new HybridBinarizer(source));
                Map<DecodeHintType, Object> hints = new EnumMap<>(DecodeHintType.class);
                hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
                return new MultiFormatReader().decode(binary, hints);
            } catch (Exception ignored) {
                // Try the next rotation.
            } finally {
                if (current != bitmap) current.recycle();
            }
        }
        return null;
    }

    private Bitmap rotate(Bitmap bitmap, int degrees) {
        Matrix matrix = new Matrix();
        matrix.postRotate(degrees);
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
    }

    private void onFileSelected(Uri uri) {
        if (uri == null) return;
        String name = displayName(uri);
        String mime = getContentResolver().getType(uri);
        try {
            if ((name != null && name.toLowerCase(Locale.ROOT).endsWith(".xlsx"))
                    || (mime != null && mime.contains("spreadsheet"))) {
                try (InputStream in = getContentResolver().openInputStream(uri)) {
                    if (in == null) throw new IllegalStateException("stream");
                    applyImport(ImportParser.parseRows(XlsxReader.read(in)));
                }
            } else {
                try (InputStream in = getContentResolver().openInputStream(uri)) {
                    if (in == null) throw new IllegalStateException("stream");
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buffer = new byte[8192];
                    int n;
                    while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
                    String text = new String(out.toByteArray(), StandardCharsets.UTF_8);
                    if (!text.isEmpty() && text.charAt(0) == '\uFEFF') text = text.substring(1);
                    applyImport(ImportParser.parse(text));
                }
            }
        } catch (Exception e) {
            Toast.makeText(this, R.string.import_failed, Toast.LENGTH_SHORT).show();
        }
    }

    private String displayName(Uri uri) {
        try (android.database.Cursor cursor = getContentResolver()
                .query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) return cursor.getString(index);
            }
        } catch (Exception ignored) {
        }
        return uri.getLastPathSegment();
    }

    private void applyImport(ImportParser.Result parsed) {
        if (parsed.items.isEmpty()) {
            Toast.makeText(this, R.string.import_empty, Toast.LENGTH_SHORT).show();
            return;
        }
        if (!session.isMatch()) {
            session = store.ensure(MODE_MATCH);
        }
        SessionOps.setExpected(session, parsed.items, SnUtil.nowIso());
        store.touch(session);
        mode = MODE_MATCH;
        store.setLastMode(mode);
        refreshAll();
        String message = getString(R.string.import_success, parsed.items.size());
        if (parsed.duplicates > 0) message += " " + getString(R.string.import_duplicate, parsed.duplicates);
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }

    @Override
    public void onRow(ScanItem item) {
        ItemDetailDialog.show(this, store, session, item, this::refreshAll, null);
    }

    @Override
    public void onEdit(ScanItem item) {
        EditItemDialog.show(this, store, session, item.sn, this::refreshAll);
    }
}
