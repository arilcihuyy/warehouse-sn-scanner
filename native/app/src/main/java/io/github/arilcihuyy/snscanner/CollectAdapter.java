package io.github.arilcihuyy.snscanner;

import android.content.Context;
import android.content.res.ColorStateList;
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

public class CollectAdapter extends RecyclerView.Adapter<CollectAdapter.Holder> {
    public interface Listener {
        void onEdit(int originalIndex);
    }

    public static final class Row {
        public final CollectItem item;
        public final int index;

        public Row(CollectItem item, int index) {
            this.item = item;
            this.index = index;
        }
    }

    private final List<Row> rows = new ArrayList<>();
    private final Listener listener;

    public CollectAdapter(Listener listener) {
        this.listener = listener;
    }

    public void submit(List<Row> next) {
        rows.clear();
        rows.addAll(next);
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public Holder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_collect, parent, false);
        return new Holder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull Holder holder, int position) {
        Row row = rows.get(position);
        CollectItem item = row.item;
        Context context = holder.itemView.getContext();
        holder.sn.setText(item.sn);
        holder.meta.setText(item.brand + " · " + SnUtil.shortTime(item.lastAt));
        holder.badge.setText(item.brand);
        holder.dot.setBackgroundTintList(ColorStateList.valueOf(brandColor(context, item.brand)));
        View.OnClickListener edit = v -> listener.onEdit(row.index);
        holder.itemView.setOnClickListener(edit);
        holder.edit.setOnClickListener(edit);
    }

    private int brandColor(Context context, String brand) {
        switch (brand) {
            case SnUtil.BRAND_ZTE:
                return ContextCompat.getColor(context, R.color.accent);
            case SnUtil.BRAND_HUAWEI:
                return ContextCompat.getColor(context, R.color.danger);
            case SnUtil.BRAND_FIBERHOME:
                return ContextCompat.getColor(context, R.color.success);
            case SnUtil.BRAND_RCM:
                return ContextCompat.getColor(context, R.color.warning);
            default:
                return ContextCompat.getColor(context, R.color.ink_faint);
        }
    }

    @Override
    public int getItemCount() {
        return rows.size();
    }

    static final class Holder extends RecyclerView.ViewHolder {
        final TextView sn;
        final TextView meta;
        final TextView badge;
        final View dot;
        final ImageButton edit;

        Holder(@NonNull View itemView) {
            super(itemView);
            sn = itemView.findViewById(R.id.snText);
            meta = itemView.findViewById(R.id.metaText);
            badge = itemView.findViewById(R.id.brandBadge);
            dot = itemView.findViewById(R.id.brandDot);
            edit = itemView.findViewById(R.id.editButton);
        }
    }
}
