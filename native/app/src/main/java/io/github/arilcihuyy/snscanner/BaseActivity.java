package io.github.arilcihuyy.snscanner;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.dialog.MaterialAlertDialogBuilder;

/** Shared export sheet: XLSX with a filename prompt, CSV download, TSV clipboard. */
public abstract class BaseActivity extends AppCompatActivity {
    private ActivityResultLauncher<String> createXlsx;
    private ActivityResultLauncher<String> createCsv;
    private byte[] pendingBytes;
    private String pendingName;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createXlsx = registerForActivityResult(new ActivityResultContracts.CreateDocument(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), this::writePending);
        createCsv = registerForActivityResult(new ActivityResultContracts.CreateDocument("text/csv"),
                this::writePending);
    }

    protected void showExportSheet(ScanSession session, Runnable afterChange) {
        if (session == null || (session.items.isEmpty() && session.unmatched.isEmpty())) {
            Toast.makeText(this, R.string.export_empty, Toast.LENGTH_SHORT).show();
            return;
        }
        View view = LayoutInflater.from(this).inflate(R.layout.dialog_export, null);
        TextView summary = view.findViewById(R.id.exportSummary);
        SessionOps.Summary stats = SessionOps.summary(session);
        summary.setText(getString(R.string.export_summary, session.name, stats.unique,
                stats.totalScans, stats.duplicates, stats.qty));

        androidx.appcompat.app.AlertDialog dialog = new MaterialAlertDialogBuilder(this)
                .setTitle(R.string.export_title)
                .setView(view)
                .setNegativeButton(R.string.close, null)
                .create();

        view.findViewById(R.id.exportXlsx).setOnClickListener(v -> {
            dialog.dismiss();
            promptFilename(session);
        });
        view.findViewById(R.id.exportCsv).setOnClickListener(v -> {
            dialog.dismiss();
            exportCsv(session);
        });
        view.findViewById(R.id.exportTsv).setOnClickListener(v -> {
            dialog.dismiss();
            copyTsv(session);
        });
        view.findViewById(R.id.exportClear).setOnClickListener(v -> {
            dialog.dismiss();
            new MaterialAlertDialogBuilder(this)
                    .setTitle(R.string.clear_session)
                    .setMessage(getString(R.string.clear_session_confirm, session.name))
                    .setNegativeButton(R.string.cancel, null)
                    .setPositiveButton(R.string.clear, (d, w) -> {
                        Store.get(this).clear(session.id);
                        Toast.makeText(this, R.string.session_cleared, Toast.LENGTH_SHORT).show();
                        if (afterChange != null) afterChange.run();
                    })
                    .show();
        });
        dialog.show();
    }

    private void promptFilename(ScanSession session) {
        EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT);
        input.setText(ExportBuilder.defaultBase(session));
        input.setSelection(input.getText().length());
        int pad = Math.round(20 * getResources().getDisplayMetrics().density);
        LinearLayout wrapper = new LinearLayout(this);
        wrapper.setPadding(pad, pad / 2, pad, 0);
        wrapper.addView(input, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        new MaterialAlertDialogBuilder(this)
                .setTitle(R.string.export_filename_title)
                .setView(wrapper)
                .setNegativeButton(R.string.cancel, null)
                .setPositiveButton(R.string.export_download, (d, w) -> {
                    String fallback = ExportBuilder.defaultBase(session);
                    String base = SnUtil.sanitizeExportName(input.getText().toString(), fallback);
                    exportXlsx(session, base);
                })
                .show();
    }

    private void exportXlsx(ScanSession session, String base) {
        try {
            ExportBuilder.ExportData data = ExportBuilder.build(session);
            pendingBytes = ExportBuilder.workbook(data);
            pendingName = base + ".xlsx";
            createXlsx.launch(pendingName);
        } catch (Exception e) {
            Toast.makeText(this, R.string.export_failed, Toast.LENGTH_SHORT).show();
        }
    }

    private void exportCsv(ScanSession session) {
        try {
            ExportBuilder.ExportData data = ExportBuilder.build(session);
            pendingBytes = ExportBuilder.csv(data);
            pendingName = ExportBuilder.defaultBase(session) + ".csv";
            createCsv.launch(pendingName);
        } catch (Exception e) {
            Toast.makeText(this, R.string.export_failed, Toast.LENGTH_SHORT).show();
        }
    }

    private void copyTsv(ScanSession session) {
        try {
            ExportBuilder.ExportData data = ExportBuilder.build(session);
            ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (clipboard == null) return;
            clipboard.setPrimaryClip(ClipData.newPlainText("SN", ExportBuilder.tsv(data)));
            Toast.makeText(this, R.string.copy_done, Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, R.string.export_failed, Toast.LENGTH_SHORT).show();
        }
    }

    private void writePending(Uri uri) {
        if (uri == null || pendingBytes == null) {
            pendingBytes = null;
            pendingName = null;
            return;
        }
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
}
