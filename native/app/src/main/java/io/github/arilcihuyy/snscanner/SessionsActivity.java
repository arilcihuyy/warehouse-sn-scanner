package io.github.arilcihuyy.snscanner;

import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.core.content.ContextCompat;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.google.android.material.dialog.MaterialAlertDialogBuilder;

import java.util.List;

/** Create, rename, switch, clear and delete sessions for both modes. */
public class SessionsActivity extends BaseActivity implements SessionAdapter.Listener {
    private Store store;
    private SessionAdapter adapter;
    private String mode = ScanSession.MODE_COLLECT;
    private TextView tabCollect;
    private TextView tabMatch;
    private View emptyState;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_sessions);
        store = Store.get(this);
        mode = store.lastMode();

        tabCollect = findViewById(R.id.tabCollect);
        tabMatch = findViewById(R.id.tabMatch);
        emptyState = findViewById(R.id.emptyState);

        RecyclerView list = findViewById(R.id.sessionList);
        list.setLayoutManager(new LinearLayoutManager(this));
        adapter = new SessionAdapter(this);
        list.setAdapter(adapter);

        findViewById(R.id.backButton).setOnClickListener(v -> finish());
        findViewById(R.id.newSessionButton).setOnClickListener(v -> promptNewSession());
        tabCollect.setOnClickListener(v -> selectMode(ScanSession.MODE_COLLECT));
        tabMatch.setOnClickListener(v -> selectMode(ScanSession.MODE_MATCH));
        styleTabs();
    }

    @Override
    protected void onResume() {
        super.onResume();
        refresh();
    }

    private void selectMode(String next) {
        mode = next;
        styleTabs();
        refresh();
    }

    private void styleTabs() {
        boolean collect = ScanSession.MODE_COLLECT.equals(mode);
        tabCollect.setBackgroundResource(collect ? R.drawable.bg_segment_active : 0);
        tabCollect.setTextColor(ContextCompat.getColor(this, collect ? R.color.ink : R.color.ink_faint));
        tabCollect.setTypeface(null, collect ? android.graphics.Typeface.BOLD : android.graphics.Typeface.NORMAL);
        tabMatch.setBackgroundResource(collect ? 0 : R.drawable.bg_segment_active);
        tabMatch.setTextColor(ContextCompat.getColor(this, collect ? R.color.ink_faint : R.color.ink));
        tabMatch.setTypeface(null, collect ? android.graphics.Typeface.NORMAL : android.graphics.Typeface.BOLD);
    }

    private void refresh() {
        List<ScanSession> sessions = store.list(mode);
        ScanSession active = store.active(mode);
        adapter.submit(sessions, active == null ? null : active.id);
        emptyState.setVisibility(sessions.isEmpty() ? View.VISIBLE : View.GONE);
        findViewById(R.id.sessionList).setVisibility(sessions.isEmpty() ? View.GONE : View.VISIBLE);
    }

    private void promptNewSession() {
        EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT);
        input.setText(ScanSession.MODE_MATCH.equals(mode) ? "Cocokkan Daftar" : "Scan Bebas");
        input.setSelection(input.getText().length());
        AlertDialog dialog = new MaterialAlertDialogBuilder(this)
                .setTitle(R.string.new_session_title)
                .setView(wrap(input))
                .setNegativeButton(R.string.cancel, null)
                .setPositiveButton(R.string.save, null)
                .create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String name = input.getText().toString();
            ScanSession created = store.create(mode, name);
            store.switchTo(created.id);
            store.setLastMode(created.mode);
            dialog.dismiss();
            Toast.makeText(this, R.string.session_created, Toast.LENGTH_SHORT).show();
            refresh();
        }));
        dialog.show();
    }

    private void promptRename(ScanSession session) {
        EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT);
        input.setText(session.name);
        input.setSelection(input.getText().length());
        AlertDialog dialog = new MaterialAlertDialogBuilder(this)
                .setTitle(R.string.rename_session_title)
                .setView(wrap(input))
                .setNegativeButton(R.string.cancel, null)
                .setPositiveButton(R.string.save, null)
                .create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            store.rename(session.id, input.getText().toString());
            dialog.dismiss();
            Toast.makeText(this, R.string.session_renamed, Toast.LENGTH_SHORT).show();
            refresh();
        }));
        dialog.show();
    }

    private View wrap(EditText input) {
        int pad = Math.round(20 * getResources().getDisplayMetrics().density);
        LinearLayout wrapper = new LinearLayout(this);
        wrapper.setPadding(pad, pad / 2, pad, 0);
        wrapper.addView(input, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        return wrapper;
    }

    @Override
    public void onAction(ScanSession session, int action) {
        switch (action) {
            case SessionAdapter.ACTION_RESUME:
                store.switchTo(session.id);
                store.setLastMode(session.mode);
                mode = session.mode;
                styleTabs();
                Toast.makeText(this, getString(R.string.session_active_toast, session.name),
                        Toast.LENGTH_SHORT).show();
                refresh();
                break;
            case SessionAdapter.ACTION_RENAME:
                promptRename(session);
                break;
            case SessionAdapter.ACTION_EXPORT:
                showExportSheet(session, this::refresh);
                break;
            case SessionAdapter.ACTION_CLEAR:
                new MaterialAlertDialogBuilder(this)
                        .setTitle(R.string.clear)
                        .setMessage(getString(R.string.clear_session_confirm, session.name))
                        .setNegativeButton(R.string.cancel, null)
                        .setPositiveButton(R.string.clear, (d, w) -> {
                            store.clear(session.id);
                            Toast.makeText(this, R.string.session_cleared, Toast.LENGTH_SHORT).show();
                            refresh();
                        })
                        .show();
                break;
            case SessionAdapter.ACTION_DELETE:
                new MaterialAlertDialogBuilder(this)
                        .setTitle(R.string.delete)
                        .setMessage(getString(R.string.delete_session_confirm, session.name))
                        .setNegativeButton(R.string.cancel, null)
                        .setPositiveButton(R.string.delete, (d, w) -> {
                            store.remove(session.id);
                            Toast.makeText(this, R.string.session_deleted, Toast.LENGTH_SHORT).show();
                            refresh();
                        })
                        .show();
                break;
            default:
                break;
        }
    }
}
