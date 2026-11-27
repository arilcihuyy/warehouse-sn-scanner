package io.github.arilcihuyy.snscanner;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import java.util.ArrayList;
import java.util.List;

/** Inventory list rows. */
public class InventoryAdapter extends RecyclerView.Adapter<InventoryAdapter.Holder> {
    public interface Listener {
        void onRow(ScanItem item);
    }

    private final List<ScanItem> rows = new ArrayList<>();
    private final Listener listener;
    private boolean matchMode;

    public InventoryAdapter(Listener listener) {
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
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_inventory, parent, false);
        return new Holder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull Holder holder, int position) {
        ScanItem item = rows.get(position);
        holder.name.setText(item.displayName());
        holder.sn.setText(item.sn);
        StringBuilder tags = new StringBuilder();
        appendTag(tags, item.brand);
        appendTag(tags, item.category);
        appendTag(tags, SnUtil.qty(item.qty) + " unit");
        if (matchMode && item.isFound()) appendTag(tags, "Ketemu");
        if (!matchMode && SnUtil.qty(item.scanCount) > 1) appendTag(tags, item.scanCount + "× scan");
        holder.tags.setText(tags.toString());
        holder.time.setText(SnUtil.formatTime(item.timeStamp()));
        holder.itemView.setOnClickListener(v -> listener.onRow(item));
    }

    private void appendTag(StringBuilder builder, String value) {
        if (value == null || value.isEmpty()) return;
        if (builder.length() > 0) builder.append(" · ");
        builder.append(value);
    }

    @Override
    public int getItemCount() {
        return rows.size();
    }

    static final class Holder extends RecyclerView.ViewHolder {
        final TextView name;
        final TextView sn;
        final TextView tags;
        final TextView time;

        Holder(@NonNull View itemView) {
            super(itemView);
            name = itemView.findViewById(R.id.itemName);
            sn = itemView.findViewById(R.id.itemSn);
            tags = itemView.findViewById(R.id.itemTags);
            time = itemView.findViewById(R.id.itemTime);
        }
    }
}
