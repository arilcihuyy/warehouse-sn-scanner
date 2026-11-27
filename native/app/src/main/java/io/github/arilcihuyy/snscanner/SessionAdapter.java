package io.github.arilcihuyy.snscanner;

import android.content.Context;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.recyclerview.widget.RecyclerView;

import java.util.ArrayList;
import java.util.List;

/** Session cards with the web action set. */
public class SessionAdapter extends RecyclerView.Adapter<SessionAdapter.Holder> {
    public static final int ACTION_RESUME = 0;
    public static final int ACTION_RENAME = 1;
    public static final int ACTION_EXPORT = 2;
    public static final int ACTION_CLEAR = 3;
    public static final int ACTION_DELETE = 4;

    public interface Listener {
        void onAction(ScanSession session, int action);
    }

    private final List<ScanSession> rows = new ArrayList<>();
    private final Listener listener;
    private String activeId;

    public SessionAdapter(Listener listener) {
        this.listener = listener;
    }

    public void submit(List<ScanSession> next, String activeId) {
        rows.clear();
        rows.addAll(next);
        this.activeId = activeId;
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public Holder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_session, parent, false);
        return new Holder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull Holder holder, int position) {
        ScanSession session = rows.get(position);
        SessionOps.Summary summary = SessionOps.summary(session);
        holder.name.setText(session.name);
        holder.started.setText(holder.itemView.getContext()
                .getString(R.string.session_started, SnUtil.formatTime(session.createdAt)));
        holder.stats.setText(holder.itemView.getContext()
                .getString(R.string.session_stats, summary.unique, summary.totalScans, summary.duplicates));
        holder.badge.setVisibility(session.id.equals(activeId) ? View.VISIBLE : View.GONE);
        bindActions(holder.actions, session);
    }

    private void bindActions(LinearLayout container, ScanSession session) {
        container.removeAllViews();
        Context context = container.getContext();
        addAction(container, context, context.getString(R.string.resume), ACTION_RESUME, session, true);
        addAction(container, context, context.getString(R.string.rename), ACTION_RENAME, session, false);
        addAction(container, context, context.getString(R.string.export), ACTION_EXPORT, session, false);
        addAction(container, context, context.getString(R.string.clear), ACTION_CLEAR, session, false);
        addAction(container, context, context.getString(R.string.delete), ACTION_DELETE, session, false);
    }

    private void addAction(LinearLayout container, Context context, String label, int action,
                           ScanSession session, boolean primary) {
        TextView view = new TextView(context);
        view.setText(label);
        view.setTextSize(11.5f);
        view.setTextColor(ContextCompat.getColor(context, primary ? R.color.white
                : action == ACTION_DELETE ? R.color.danger : R.color.ink_soft));
        view.setBackgroundResource(primary ? R.drawable.bg_chip_active : R.drawable.bg_chip);
        int padH = Math.round(12 * context.getResources().getDisplayMetrics().density);
        int padV = Math.round(7 * context.getResources().getDisplayMetrics().density);
        view.setPadding(padH, padV, padH, padV);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        params.setMarginEnd(Math.round(6 * context.getResources().getDisplayMetrics().density));
        view.setLayoutParams(params);
        view.setOnClickListener(v -> listener.onAction(session, action));
        container.addView(view);
    }

    @Override
    public int getItemCount() {
        return rows.size();
    }

    static final class Holder extends RecyclerView.ViewHolder {
        final TextView name;
        final TextView started;
        final TextView stats;
        final TextView badge;
        final LinearLayout actions;

        Holder(@NonNull View itemView) {
            super(itemView);
            name = itemView.findViewById(R.id.sessionName);
            started = itemView.findViewById(R.id.sessionStarted);
            stats = itemView.findViewById(R.id.sessionStats);
            badge = itemView.findViewById(R.id.sessionBadge);
            actions = itemView.findViewById(R.id.sessionActions);
        }
    }
}
