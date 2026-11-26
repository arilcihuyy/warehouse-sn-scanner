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
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.google.android.material.appbar.MaterialToolbar;
import com.google.android.material.chip.ChipGroup;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.google.android.material.progressindicator.LinearProgressIndicator;
import com.google.android.material.textfield.TextInputEditText;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

public class MatchActivity extends AppCompatActivity implements MatchAdapter.Listener {
    private Store store;
    private MatchAdapter adapter;
    private TextInputEditText search;
    private ChipGroup filters;
    private TextView remaining;
    private TextView foundProgress;
    private TextView emptyTitle;
    private TextView emptyBody;
    private View emptyImport;
    private View reset;
    private LinearProgressIndicator progress;

    private int filter = 0;
    private ActivityResultLauncher<String[]> openDocument;
    private ActivityResultLauncher<String> createXlsx;
    private ActivityResultLauncher<String> createCsv;
    private byte[] pendingBytes;
    private String pendingName;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_match);
        store = Store.get(this);

        MaterialToolbar toolbar = findViewById(R.id.toolbar);
        toolbar.setNavigationOnClickListener(v -> finish());

        remaining = findViewById(R.id.remainingCount);
        foundProgress = findViewById(R.id.foundProgress);
        progress = findViewById(R.id.matchProgress);
        search = findViewById(R.id.searchInput);
        filters = findViewById(R.id.matchFilters);
        emptyTitle = findViewById(R.id.matchEmptyTitle);
        emptyBody = findViewById(R.id.matchEmptyBody);
        emptyImport = findViewById(R.id.emptyImportButton);
        reset = findViewById(R.id.matchReset);

        RecyclerView list = findViewById(R.id.matchList);
        list.setLayoutManager(new LinearLayoutManager(this));
        adapter = new MatchAdapter(this);
        list.setAdapter(adapter);

        openDocument = registerForActivityResult(new ActivityResultContracts.OpenDocument(), this::onFileSelected);
        createXlsx = registerForActivityResult(new ActivityResultContracts.CreateDocument(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), this::writePending);
        createCsv = registerForActivityResult(new ActivityResultContracts.CreateDocument("text/csv"), this::writePending);

        findViewById(R.id.scanButton).setOnClickListener(v -> startScan());
        findViewById(R.id.importButton).setOnClickListener(v -> confirmReplace(this::showImportSource));
        emptyImport.setOnClickListener(v -> confirmReplace(this::showImportSource));
        findViewById(R.id.exportButton).setOnClickListener(v -> showExport());
        reset.setOnClickListener(v -> confirmReset());

        filters.setOnCheckedStateChangeListener((group, checkedIds) -> {
            int id = checkedIds.isEmpty() ? R.id.filterAll : checkedIds.get(0);
            filter = id == R.id.filterPending ? 1 : id == R.id.filterFound ? 2 : 0;
            refresh();
        });
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
    }

    @Override
    protected void onResume() {
        super.onResume();
        refresh();
    }

    private void startScan() {
        MatchSession session = store.getMatch();
        if (session == null || session.items.isEmpty()) {
            showImportSource();
            return;
        }
        Intent intent = new Intent(this, ScannerActivity.class);
        intent.putExtra(ScannerActivity.EXTRA_MODE, ScannerActivity.MODE_MATCH);
        startActivity(intent);
    }

    private void confirmReplace(Runnable next) {
        MatchSession session = store.getMatch();
        if (session == null || session.items.isEmpty()) {
            next.run();
            return;
        }
        new MaterialAlertDialogBuilder(this)
                .setTitle("Ganti daftar SN?")
                .setMessage("Daftar dan status scan yang sekarang akan diganti.")
                .setNegativeButton(R.string.cancel, null)
                .setPositiveButton("Lanjut", (d, w) -> next.run())
                .show();
    }

    private void showImportSource() {
        new MaterialAlertDialogBuilder(this)
                .setTitle(R.string.import_list)
                .setItems(new String[]{"Pilih file (.txt/.csv)", "Tempel daftar"}, (d, which) -> {
                    if (which == 0) {
                        openDocument.launch(new String[]{"text/*", "text/csv", "application/csv",
                                "application/vnd.ms-excel", "*/*"});
                    } else {
                        showPasteDialog();
                    }
                })
                .setNegativeButton(R.string.cancel, null)
                .show();
    }

    private void onFileSelected(Uri uri) {
        if (uri == null) return;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) throw new IllegalStateException("stream");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
            String text = new String(out.toByteArray(), StandardCharsets.UTF_8);
            if (!text.isEmpty() && text.charAt(0) == '\uFEFF') text = text.substring(1);
            applyImport(text);
        } catch (Exception e) {
            Toast.makeText(this, "Gagal membaca file.", Toast.LENGTH_SHORT).show();
        }
    }

    private void showPasteDialog() {
        View view = LayoutInflater.from(this).inflate(R.layout.dialog_paste, null);
        TextInputEditText input = view.findViewById(R.id.pasteInput);
        androidx.appcompat.app.AlertDialog dialog = new MaterialAlertDialogBuilder(this)
                .setView(view)
                .create();
        view.findViewById(R.id.pasteCancel).setOnClickListener(v -> dialog.dismiss());
        view.findViewById(R.id.pasteImport).setOnClickListener(v -> {
            String text = input.getText() == null ? "" : input.getText().toString();
            dialog.dismiss();
            applyImport(text);
        });
        dialog.show();
    }

    private void applyImport(String text) {
        ImportParser.Result parsed = ImportParser.parse(text);
        if (parsed.items.isEmpty()) {
            Toast.makeText(this, R.string.import_empty, Toast.LENGTH_SHORT).show();
            return;
        }
        store.createMatch(parsed.items);
        refresh();
        String message = getString(R.string.import_success, parsed.items.size());
        if (parsed.duplicates > 0) message += " " + getString(R.string.import_duplicate, parsed.duplicates);
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }

    private void refresh() {
        MatchSession session = store.getMatch();
        String query = search.getText() == null ? "" : SnUtil.key(search.getText().toString());
        List<MatchAdapter.Row> rows = new ArrayList<>();
        int total = 0;
        int found = 0;
        int remainingCount = 0;
        if (session != null) {
            total = session.items.size();
            found = session.foundCount();
            remainingCount = session.remainingCount();
            for (int i = 0; i < session.items.size(); i++) {
                MatchItem item = session.items.get(i);
                if (filter == 1 && item.isFound()) continue;
                if (filter == 2 && !item.isFound()) continue;
                if (!query.isEmpty() && !SnUtil.key(item.sn).contains(query)) continue;
                rows.add(new MatchAdapter.Row(item, i));
            }
        }
        adapter.submit(rows);
        remaining.setText(String.valueOf(remainingCount));
        foundProgress.setText(getString(R.string.progress_format, found, total));
        progress.setMax(Math.max(total, 1));
        progress.setProgressCompat(total == 0 ? 0 : found, true);

        boolean hasSession = session != null && total > 0;
        reset.setVisibility(hasSession ? View.VISIBLE : View.GONE);
        boolean empty = rows.isEmpty();
        findViewById(R.id.matchEmpty).setVisibility(empty ? View.VISIBLE : View.GONE);
        findViewById(R.id.matchList).setVisibility(empty ? View.GONE : View.VISIBLE);
        if (empty) {
            if (!hasSession) {
                emptyTitle.setText(R.string.empty_match_title);
                emptyBody.setText(R.string.empty_match_body);
                emptyImport.setVisibility(View.VISIBLE);
            } else {
                emptyTitle.setText(R.string.empty_search);
                emptyBody.setText("");
                emptyImport.setVisibility(View.GONE);
            }
        }
    }

    @Override
    public void onRowClick(int originalIndex) {
        if (store.toggleMatch(originalIndex)) refresh();
    }

    private void showExport() {
        MatchSession session = store.getMatch();
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
                            pendingBytes = ExportBuilder.matchWorkbook(session);
                            pendingName = ExportBuilder.matchFilename("xlsx");
                            createXlsx.launch(pendingName);
                        } else if (which == 1) {
                            pendingBytes = ExportBuilder.matchCsv(session);
                            pendingName = ExportBuilder.matchFilename("csv");
                            createCsv.launch(pendingName);
                        } else {
                            ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                            clipboard.setPrimaryClip(ClipData.newPlainText("SN", ExportBuilder.matchTsv(session)));
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
                .setTitle(R.string.reset_match_title)
                .setMessage(R.string.reset_match_body)
                .setNegativeButton(R.string.cancel, null)
                .setPositiveButton(R.string.reset, (d, w) -> {
                    store.clearMatch();
                    refresh();
                })
                .show();
    }
}
