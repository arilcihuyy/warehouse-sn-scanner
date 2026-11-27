package io.github.arilcihuyy.snscanner;

import android.view.LayoutInflater;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.dialog.MaterialAlertDialogBuilder;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Add/edit sheet shared by scanner, inventory and home manual entry. */
public final class EditItemDialog {
    private EditItemDialog() {
    }

    public static void show(AppCompatActivity activity, Store store, ScanSession session,
                            String originalSn, Runnable onChanged) {
        if (session == null) return;
        ScanItem item = originalSn == null ? null : session.bySn(originalSn);
        boolean editing = item != null;

        View view = LayoutInflater.from(activity).inflate(R.layout.dialog_edit_item, null);
        TextView title = view.findViewById(R.id.editTitle);
        EditText snInput = view.findViewById(R.id.editSn);
        EditText nameInput = view.findViewById(R.id.editName);
        Spinner brandInput = view.findViewById(R.id.editBrand);
        Spinner categoryInput = view.findViewById(R.id.editCategory);
        EditText qtyInput = view.findViewById(R.id.editQty);
        EditText locationInput = view.findViewById(R.id.editLocation);
        EditText formatInput = view.findViewById(R.id.editFormat);
        EditText notesInput = view.findViewById(R.id.editNotes);
        TextView delete = view.findViewById(R.id.deleteButton);

        List<String> brandLabels = new ArrayList<>();
        brandLabels.add(activity.getString(R.string.brand_auto));
        brandLabels.addAll(Arrays.asList(SnUtil.BRANDS));
        brandInput.setAdapter(new ArrayAdapter<>(activity,
                android.R.layout.simple_spinner_dropdown_item, brandLabels));
        categoryInput.setAdapter(new ArrayAdapter<>(activity,
                android.R.layout.simple_spinner_dropdown_item, Arrays.asList(SnUtil.CATEGORIES)));

        title.setText(editing ? R.string.edit_item : R.string.add_manual);
        if (editing) {
            snInput.setText(item.sn);
            snInput.setSelection(item.sn.length());
            nameInput.setText(item.name);
            brandInput.setSelection(Math.max(0, brandLabels.indexOf(item.brand)));
            categoryInput.setSelection(Math.max(0, Arrays.asList(SnUtil.CATEGORIES).indexOf(item.category)));
            qtyInput.setText(String.valueOf(SnUtil.qty(item.qty)));
            locationInput.setText(item.location);
            formatInput.setText(item.format);
            notesInput.setText(item.notes);
            delete.setVisibility(View.VISIBLE);
        } else {
            delete.setVisibility(View.GONE);
            String active = session.activeBrand;
            brandInput.setSelection(SnUtil.isAutoBrand(active) ? 0 : Math.max(0, brandLabels.indexOf(active)));
            qtyInput.setText("1");
        }

        AlertDialog dialog = new MaterialAlertDialogBuilder(activity).setView(view).create();
        view.findViewById(R.id.cancelButton).setOnClickListener(v -> dialog.dismiss());
        view.findViewById(R.id.qtyMinus).setOnClickListener(v -> {
            int value = parseInt(qtyInput.getText().toString());
            qtyInput.setText(String.valueOf(Math.max(1, value - 1)));
        });
        view.findViewById(R.id.qtyPlus).setOnClickListener(v -> {
            int value = parseInt(qtyInput.getText().toString());
            qtyInput.setText(String.valueOf(value + 1));
        });

        delete.setOnClickListener(v -> new MaterialAlertDialogBuilder(activity)
                .setTitle(R.string.delete_collect_title)
                .setMessage(activity.getString(R.string.delete_collect_body, item == null ? "" : item.sn))
                .setNegativeButton(R.string.cancel, null)
                .setPositiveButton(R.string.delete, (d, w) -> {
                    if (originalSn != null && SessionOps.deleteItem(session, originalSn)) {
                        store.touch(session);
                        Toast.makeText(activity, R.string.collect_deleted, Toast.LENGTH_SHORT).show();
                        dialog.dismiss();
                        if (onChanged != null) onChanged.run();
                    }
                })
                .show());

        view.findViewById(R.id.saveButton).setOnClickListener(v -> {
            String sn = snInput.getText().toString();
            if (SnUtil.clean(sn).isEmpty()) {
                snInput.setError(activity.getString(R.string.collect_required));
                return;
            }
            SessionOps.Meta meta = new SessionOps.Meta();
            meta.sn = sn;
            meta.name = nameInput.getText().toString();
            meta.brand = brandInput.getSelectedItemPosition() == 0
                    ? SnUtil.BRAND_AUTO : SnUtil.BRANDS[brandInput.getSelectedItemPosition() - 1];
            meta.category = (String) categoryInput.getSelectedItem();
            meta.qty = parseInt(qtyInput.getText().toString());
            meta.location = locationInput.getText().toString();
            meta.format = formatInput.getText().toString();
            meta.notes = notesInput.getText().toString();

            if (editing) {
                SessionOps.UpdateResult result = SessionOps.replaceItem(session, originalSn, meta);
                if (result.status == SessionOps.UpdateStatus.DUP) {
                    snInput.setError(activity.getString(R.string.collect_duplicate));
                    return;
                }
                if (result.status == SessionOps.UpdateStatus.INVALID) {
                    snInput.setError(activity.getString(R.string.collect_required));
                    return;
                }
                if (result.status == SessionOps.UpdateStatus.NOT_FOUND) {
                    Toast.makeText(activity, R.string.collect_not_found, Toast.LENGTH_SHORT).show();
                    dialog.dismiss();
                    return;
                }
                store.touch(session);
                Toast.makeText(activity, R.string.collect_updated, Toast.LENGTH_SHORT).show();
            } else {
                SessionOps.Result result = session.isMatch()
                        ? SessionOps.addExpected(session, sn, meta, SnUtil.nowIso())
                        : SessionOps.addScan(session, sn, meta, SnUtil.nowIso());
                if (result.status == SessionOps.Status.DUP || result.status == SessionOps.Status.ALREADY) {
                    Toast.makeText(activity, R.string.collect_duplicate, Toast.LENGTH_SHORT).show();
                    dialog.dismiss();
                    return;
                }
                if (result.status == SessionOps.Status.INVALID) {
                    snInput.setError(activity.getString(R.string.collect_required));
                    return;
                }
                store.touch(session);
                Toast.makeText(activity, R.string.collect_added, Toast.LENGTH_SHORT).show();
            }
            dialog.dismiss();
            if (onChanged != null) onChanged.run();
        });
        dialog.show();
    }

    private static int parseInt(String value) {
        try {
            return Math.max(1, Integer.parseInt(value.trim()));
        } catch (Exception e) {
            return 1;
        }
    }
}
