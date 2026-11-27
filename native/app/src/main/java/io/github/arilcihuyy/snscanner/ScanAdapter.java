package io.github.arilcihuyy.snscanner;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageButton;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.recyclerview.widget.RecyclerView;

import java.util.ArrayList;
import java.util.List;

/** Compact rows inside the scanner sheet. */
public class ScanAdapter extends RecyclerView.Adapter<ScanAdapter.Holder> {
    public interface Listener {
        void onRow(ScanItem item);

        void onEdit(ScanItem item);
    }

    private final List<ScanItem> rows = new ArrayList<>();
    private final Listener listener;
    private boolean matchMode;

    public ScanAdapter(Listener listener) {
        this.listener = listener;
    }

    public void submit(List<ScanItem> next, boolean matchMode) {
        rows.clear();
        rows.addAll(next);
        this.matchMode = matchMode;
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public Holder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_scan, parent, false);
        return new Holder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull Holder holder, int position) {
        ScanItem item = rows.get(position);
        int scans = matchMode ? (item.isFound() ? 1 : 0) : SnUtil.qty(item.scanCount);
        String pill = matchMode ? (item.isFound() ? "OK" : "…") : "×" + scans;
        holder.pill.setText(pill);
        holder.pill.setBackgroundResource(scans > 1 ? R.drawable.bg_pill_dup : R.drawable.bg_pill);
        holder.pill.setTextColor(ContextCompat.getColor(holder.itemView.getContext(),
                scans > 1 ? R.color.warning : R.color.ink_soft));
        holder.sn.setText(item.sn);
        String time = SnUtil.shortTime(item.timeStamp());
        String meta = matchMode
                ? join(item.brand, item.isFound() ? "Cocok" : "Belum", time)
                : join(item.brand, time, scans + "× scan");
        holder.meta.setText(meta);
        holder.itemView.setOnClickListener(v -> listener.onRow(item));
        holder.edit.setOnClickListener(v -> listener.onEdit(item));
    }

    private String join(String... parts) {
        StringBuilder b = new StringBuilder();
        for (String part : parts) {
            if (part == null || part.isEmpty()) continue;
            if (b.length() > 0) b.append(" · ");
            b.append(part);
        }
        return b.toString();
    }

    @Override
    public int getItemCount() {
        return rows.size();
    }

    static final class Holder extends RecyclerView.ViewHolder {
        final TextView pill;
        final TextView sn;
        final TextView meta;
        final ImageButton edit;

        Holder(@NonNull View itemView) {
            super(itemView);
            pill = itemView.findViewById(R.id.scanPill);
            sn = itemView.findViewById(R.id.scanSn);
            meta = itemView.findViewById(R.id.scanMeta);
            edit = itemView.findViewById(R.id.scanEdit);
        }
    }
}
