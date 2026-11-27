package io.github.arilcihuyy.snscanner;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.LayoutInflater;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.widget.ArrayAdapter;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.google.android.material.appbar.MaterialToolbar;
import com.google.android.material.chip.Chip;
import com.google.android.material.chip.ChipGroup;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.google.android.material.textfield.MaterialAutoCompleteTextView;
import com.google.android.material.textfield.TextInputEditText;

import java.util.ArrayList;
import java.util.List;

public class CollectActivity extends AppCompatActivity implements CollectAdapter.Listener {
    public static final String EXTRA_FOCUS_SEARCH = "focus_search";
    private static final int[] CHIP_IDS = {
            R.id.chipAuto, R.id.chipZte, R.id.chipHuawei, R.id.chipFiberhome, R.id.chipRcm, R.id.chipOther
    };
    private static final String[] CHIP_BRANDS = {
            SnUtil.BRAND_AUTO, SnUtil.BRAND_ZTE, SnUtil.BRAND_HUAWEI,
            SnUtil.BRAND_FIBERHOME, SnUtil.BRAND_RCM, SnUtil.BRAND_OTHER
    };
    private static final String[] BRAND_LABELS = {
            "Auto", "ZTE", "Huawei", "FiberHome", "RCM", "Lainnya"
    };

    private Store store;
    private CollectAdapter adapter;
    private TextInputEditText search;
    private ChipGroup brandChips;
    private TextView count;
    private TextView started;
    private TextView emptyTitle;
    private TextView emptyBody;
    private View reset;

    private boolean bindingBrand;
    private ActivityResultLauncher<String> createXlsx;
    private ActivityResultLauncher<String> createCsv;
    private byte[] pendingBytes;
    private String pendingName;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_collect);
        store = Store.get(this);

        MaterialToolbar toolbar = findViewById(R.id.toolbar);
        toolbar.setNavigationOnClickListener(v -> finish());

        count = findViewById(R.id.collectCount);
        started = findViewById(R.id.collectStarted);
        search = findViewById(R.id.searchInput);
        brandChips = findViewById(R.id.brandChips);
        emptyTitle = findViewById(R.id.collectEmptyTitle);
        emptyBody = findViewById(R.id.collectEmptyBody);
        reset = findViewById(R.id.collectReset);

        RecyclerView list = findViewById(R.id.collectList);
        list.setLayoutManager(new LinearLayoutManager(this));
        adapter = new CollectAdapter(this);
        list.setAdapter(adapter);

        createXlsx = registerForActivityResult(new ActivityResultContracts.CreateDocument(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), this::writePending);
        createCsv = registerForActivityResult(new ActivityResultContracts.CreateDocument("text/csv"), this::writePending);

        findViewById(R.id.scanButton).setOnClickListener(v -> startScan());
        findViewById(R.id.addButton).setOnClickListener(v -> showEditDialog(-1));
        findViewById(R.id.exportButton).setOnClickListener(v -> showExport());
        reset.setOnClickListener(v -> confirmReset());

        for (int i = 0; i < CHIP_IDS.length; i++) {
            final String brand = CHIP_BRANDS[i];
            Chip chip = findViewById(CHIP_IDS[i]);
            chip.setOnCheckedChangeListener((buttonView, checked) -> {
                if (checked && !bindingBrand) {
                    store.setActiveBrand(brand);
                }
            });
        }
        search.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {
            }

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                refresh();
            }

            @Override
            public void afterTextChanged(Editable s) {
            }
        });

        if (getIntent().getBooleanExtra(EXTRA_FOCUS_SEARCH, false)) {
            search.postDelayed(() -> {
                search.requestFocus();
                InputMethodManager keyboard = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
                if (keyboard != null) {
                    keyboard.showSoftInput(search, InputMethodManager.SHOW_IMPLICIT);
                }
            }, 220L);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        refresh();
    }

    private void startScan() {
        Intent intent = new Intent(this, ScannerActivity.class);
        intent.putExtra(ScannerActivity.EXTRA_MODE, ScannerActivity.MODE_COLLECT);
        startActivity(intent);
    }

    private void refresh() {
        CollectSession session = store.getCollect();
        int total = session == null ? 0 : session.items.size();
        int brands = session == null ? 0 : session.brandCount();
        count.setText(getString(R.string.collect_count, total, brands));
        if (session == null) {
            started.setText("");
        } else {
            started.setText(getString(R.string.started) + " " + SnUtil.formatTime(session.createdAt));
        }
        reset.setVisibility(total > 0 ? View.VISIBLE : View.GONE);

        bindingBrand = true;
        String active = store.getActiveBrand();
        int checked = R.id.chipAuto;
        for (int i = 0; i < CHIP_BRANDS.length; i++) {
            if (CHIP_BRANDS[i].equals(active)) {
                checked = CHIP_IDS[i];
                break;
            }
        }
        brandChips.check(checked);
        bindingBrand = false;

        String query = search.getText() == null ? "" : SnUtil.key(search.getText().toString());
        List<CollectAdapter.Row> rows = new ArrayList<>();
        if (session != null) {
            for (int i = 0; i < session.items.size(); i++) {
                CollectItem item = session.items.get(i);
                if (!query.isEmpty() && !SnUtil.key(item.sn).contains(query)
                        && !SnUtil.key(item.brand).contains(query)) continue;
                rows.add(new CollectAdapter.Row(item, i));
            }
        }
        adapter.submit(rows);
        boolean empty = rows.isEmpty();
        findViewById(R.id.collectEmpty).setVisibility(empty ? View.VISIBLE : View.GONE);
        findViewById(R.id.collectList).setVisibility(empty ? View.GONE : View.VISIBLE);
        if (empty) {
            if (total == 0) {
                emptyTitle.setText(R.string.empty_collect_title);
                emptyBody.setText(R.string.empty_collect_body);
            } else {
                emptyTitle.setText(R.string.empty_search);
                emptyBody.setText("");
            }
        }
    }

    @Override
    public void onEdit(int originalIndex) {
        showEditDialog(originalIndex);
    }

    private void showEditDialog(int index) {
        boolean editing = index >= 0;
        CollectSession session = store.getCollect();
        if (editing && (session == null || index >= session.items.size())) return;

        View view = LayoutInflater.from(this).inflate(R.layout.dialog_edit_collect, null);
        TextView title = view.findViewById(R.id.dialogTitle);
        TextInputEditText snInput = view.findViewById(R.id.editSn);
        MaterialAutoCompleteTextView brandInput = view.findViewById(R.id.editBrand);
        View delete = view.findViewById(R.id.deleteButton);
        AlertDialog dialog = new MaterialAlertDialogBuilder(this).setView(view).create();

        ArrayAdapter<String> adapter = new ArrayAdapter<>(this,
                android.R.layout.simple_list_item_1, BRAND_LABELS);
        brandInput.setAdapter(adapter);

        if (editing) {
            CollectItem item = session.items.get(index);
            title.setText(R.string.edit_sn);
            snInput.setText(item.sn);
            snInput.setSelection(item.sn.length());
            brandInput.setText(item.brand, false);
            delete.setVisibility(View.VISIBLE);
            delete.setOnClickListener(v -> confirmDelete(index, item.sn, dialog));
        } else {
            title.setText(R.string.add_manual);
            delete.setVisibility(View.GONE);
            String active = store.getActiveBrand();
            brandInput.setText(SnUtil.isAutoBrand(active) ? "Auto" : active, false);
        }

        view.findViewById(R.id.cancelButton).setOnClickListener(v -> dialog.dismiss());
        view.findViewById(R.id.saveButton).setOnClickListener(v -> {
            String sn = snInput.getText() == null ? "" : snInput.getText().toString();
            if (SnUtil.clean(sn).isEmpty()) {
                snInput.setError(getString(R.string.collect_required));
                return;
            }
            String brand = brandInput.getText() == null ? "Auto" : brandInput.getText().toString();
            if (editing) {
                SessionOps.UpdateResult result = store.updateCollect(index, sn, brand);
                if (result.status == SessionOps.UpdateStatus.DUP) {
                    snInput.setError(getString(R.string.collect_duplicate));
                    return;
                }
                if (result.status == SessionOps.UpdateStatus.INVALID) {
                    snInput.setError(getString(R.string.collect_required));
                    return;
                }
                Toast.makeText(this, R.string.collect_updated, Toast.LENGTH_SHORT).show();
            } else {
                SessionOps.AddResult result = store.addCollect(sn, brand, SnUtil.nowIso());
                if (result.status == SessionOps.AddStatus.DUP) {
                    snInput.setError(getString(R.string.collect_duplicate));
                    return;
                }
                if (result.status == SessionOps.AddStatus.INVALID) {
                    snInput.setError(getString(R.string.collect_required));
                    return;
                }
                Toast.makeText(this, R.string.collect_added, Toast.LENGTH_SHORT).show();
            }
            dialog.dismiss();
            refresh();
        });
        dialog.show();
    }

    private void confirmDelete(int index, String sn, AlertDialog parent) {
        new MaterialAlertDialogBuilder(this)
                .setTitle(R.string.delete_collect_title)
                .setMessage(getString(R.string.delete_collect_body, sn))
                .setNegativeButton(R.string.cancel, null)
                .setPositiveButton(R.string.delete, (d, w) -> {
                    store.deleteCollect(index);
                    Toast.makeText(this, R.string.collect_deleted, Toast.LENGTH_SHORT).show();
                    parent.dismiss();
                    refresh();
                })
                .show();
    }

    private void showExport() {
        CollectSession session = store.getCollect();
        if (session == null || session.items.isEmpty()) {
            Toast.makeText(this, R.string.export_empty, Toast.LENGTH_SHORT).show();
            return;
        }
        new MaterialAlertDialogBuilder(this)
                .setTitle(R.string.export)
                .setItems(new String[]{getString(R.string.export_excel),
                        getString(R.string.export_csv), getString(R.string.copy_tsv)}, (d, which) -> {
                    try {
                        if (which == 0) {
                            pendingBytes = ExportBuilder.collectWorkbook(session);
                            pendingName = ExportBuilder.collectFilename("xlsx");
                            createXlsx.launch(pendingName);
                        } else if (which == 1) {
                            pendingBytes = ExportBuilder.collectCsv(session);
                            pendingName = ExportBuilder.collectFilename("csv");
                            createCsv.launch(pendingName);
                        } else {
                            ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                            clipboard.setPrimaryClip(ClipData.newPlainText("SN", ExportBuilder.collectTsv(session)));
                            Toast.makeText(this, R.string.copy_done, Toast.LENGTH_SHORT).show();
                        }
                    } catch (Exception e) {
                        Toast.makeText(this, R.string.export_failed, Toast.LENGTH_SHORT).show();
                    }
                })
                .setNegativeButton(R.string.cancel, null)
                .show();
    }

    private void writePending(Uri uri) {
        if (uri == null || pendingBytes == null) return;
        try (java.io.OutputStream out = getContentResolver().openOutputStream(uri)) {
            if (out == null) throw new IllegalStateException("stream");
            out.write(pendingBytes);
            out.flush();
            Toast.makeText(this, getString(R.string.export_done, pendingName), Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            Toast.makeText(this, R.string.export_failed, Toast.LENGTH_SHORT).show();
        } finally {
            pendingBytes = null;
            pendingName = null;
        }
    }

    private void confirmReset() {
        new MaterialAlertDialogBuilder(this)
                .setTitle(R.string.reset_collect_title)
                .setMessage(R.string.reset_collect_body)
                .setNegativeButton(R.string.cancel, null)
                .setPositiveButton(R.string.reset, (d, w) -> {
                    store.clearCollect();
                    refresh();
                })
                .show();
    }
}
