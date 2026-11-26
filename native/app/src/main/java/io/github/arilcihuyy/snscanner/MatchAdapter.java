package io.github.arilcihuyy.snscanner;

import android.content.Context;
import android.content.res.ColorStateList;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.recyclerview.widget.RecyclerView;

import java.util.ArrayList;
import java.util.List;

public class MatchAdapter extends RecyclerView.Adapter<MatchAdapter.Holder> {
    public interface Listener {
        void onRowClick(int originalIndex);
    }

    public static final class Row {
        public final MatchItem item;
        public final int index;

        public Row(MatchItem item, int index) {
            this.item = item;
            this.index = index;
        }
    }

    private final List<Row> rows = new ArrayList<>();
    private final Listener listener;

    public MatchAdapter(Listener listener) {
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
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_match, parent, false);
        return new Holder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull Holder holder, int position) {
        Row row = rows.get(position);
        MatchItem item = row.item;
        Context context = holder.itemView.getContext();
        holder.sn.setText(item.sn);
        if (item.isFound()) {
            holder.meta.setText(context.getString(R.string.found) + " · " + SnUtil.formatTime(item.scannedAt));
            holder.badge.setText(R.string.found);
            holder.badge.setTextColor(ContextCompat.getColor(context, R.color.success));
            holder.badge.setBackgroundResource(R.drawable.bg_badge_found);
            holder.dot.setBackgroundTintList(ColorStateList.valueOf(
                    ContextCompat.getColor(context, R.color.success)));
        } else {
            holder.meta.setText(R.string.filter_pending);
            holder.badge.setText(R.string.filter_pending);
            holder.badge.setTextColor(ContextCompat.getColor(context, R.color.warning));
            holder.badge.setBackgroundResource(R.drawable.bg_badge_pending);
            holder.dot.setBackgroundTintList(ColorStateList.valueOf(
                    ContextCompat.getColor(context, R.color.warning)));
        }
        holder.itemView.setOnClickListener(v -> listener.onRowClick(row.index));
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

        Holder(@NonNull View itemView) {
            super(itemView);
            sn = itemView.findViewById(R.id.snText);
            meta = itemView.findViewById(R.id.metaText);
            badge = itemView.findViewById(R.id.statusBadge);
            dot = itemView.findViewById(R.id.statusDot);
        }
    }
}
