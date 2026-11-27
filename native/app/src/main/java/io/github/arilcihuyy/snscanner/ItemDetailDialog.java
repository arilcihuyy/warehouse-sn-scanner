package io.github.arilcihuyy.snscanner;

import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.dialog.MaterialAlertDialogBuilder;

/** Read-only item detail with an edit shortcut. */
public final class ItemDetailDialog {
    private ItemDetailDialog() {
    }

    public static void show(AppCompatActivity activity, Store store, ScanSession session,
                            ScanItem item, Runnable onChanged, Runnable onScanAgain) {
        if (item == null) return;
        StringBuilder body = new StringBuilder();
        body.append(activity.getString(R.string.detail_format)).append(": ")
                .append(item.format == null || item.format.isEmpty() ? "Barcode / QR" : item.format).append('\n');
        body.append(activity.getString(R.string.detail_name)).append(": ")
                .append(item.name == null || item.name.isEmpty() ? "-" : item.name).append('\n');
        body.append(activity.getString(R.string.detail_brand)).append(": ").append(item.brand).append('\n');
        body.append(activity.getString(R.string.detail_category)).append(": ").append(item.category).append('\n');
        body.append(activity.getString(R.string.detail_qty)).append(": ")
                .append(activity.getString(R.string.unit_format, SnUtil.qty(item.qty))).append('\n');
        body.append(activity.getString(R.string.detail_location)).append(": ")
                .append(item.location == null || item.location.isEmpty() ? "-" : item.location).append('\n');
        int scans = session.isMatch() ? (item.isFound() ? 1 : 0) : SnUtil.qty(item.scanCount);
        body.append(activity.getString(R.string.detail_scans)).append(": ")
                .append(activity.getString(R.string.scan_count_format, scans)).append('\n');
        body.append(activity.getString(R.string.detail_time)).append(": ")
                .append(SnUtil.formatTime(item.timeStamp())).append('\n');
        body.append(activity.getString(R.string.detail_notes)).append(": ")
                .append(item.notes == null || item.notes.isEmpty() ? "-" : item.notes);

        MaterialAlertDialogBuilder builder = new MaterialAlertDialogBuilder(activity)
                .setTitle(item.sn)
                .setMessage(body.toString())
                .setNegativeButton(R.string.close, null)
                .setNeutralButton(R.string.edit, (d, w) ->
                        EditItemDialog.show(activity, store, session, item.sn, onChanged));
        if (onScanAgain != null) {
            builder.setPositiveButton(R.string.scan_again, (d, w) -> onScanAgain.run());
        }
        builder.show();
    }
}
