package io.github.arilcihuyy.snscanner;

import android.content.Intent;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.Spinner;
import android.widget.TextView;

import androidx.core.content.ContextCompat;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.google.android.material.button.MaterialButton;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Unified inventory for the active session, collect or match. */
public class InventoryActivity extends BaseActivity implements InventoryAdapter.Listener {
    public static final String EXTRA_FOCUS_SEARCH = "focus_search";
    public static final String EXTRA_ADD = "add_item";

    private Store store;
    private ScanSession session;
    private InventoryAdapter adapter;
    private EditText search;
    private ImageButton searchClear;
    private TextView filterAll;
    private TextView filterDuplicates;
    private TextView filterToday;
    private Spinner categoryFilter;
    private Spinner sortSelect;
    private View emptyState;
    private TextView emptyTitle;
    private TextView emptyBody;
    private MaterialButton loadMore;

    private String query = "";
    private String category = "";
    private boolean duplicatesOnly;
    private boolean todayOnly;
    private String sort = "newest";
    private int pageSize = 100;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_inventory);
        store = Store.get(this);
        session = store.active(store.lastMode());
        if (session == null) session = store.ensure(store.lastMode());

        search = findViewById(R.id.searchInput);
        searchClear = findViewById(R.id.searchClear);
        filterAll = findViewById(R.id.filterAll);
        filterDuplicates = findViewById(R.id.filterDuplicates);
        filterToday = findViewById(R.id.filterToday);
        categoryFilter = findViewById(R.id.categoryFilter);
        sortSelect = findViewById(R.id.sortSelect);
        emptyState = findViewById(R.id.emptyState);
        emptyTitle = findViewById(R.id.emptyTitle);
        emptyBody = findViewById(R.id.emptyBody);
        loadMore = findViewById(R.id.loadMore);

        RecyclerView list = findViewById(R.id.itemList);
        list.setLayoutManager(new LinearLayoutManager(this));
        adapter = new InventoryAdapter(this);
        list.setAdapter(adapter);

        List<String> categories = new ArrayList<>();
        categories.add(getString(R.string.filter_category_all));
        categories.addAll(Arrays.asList(SnUtil.CATEGORIES));
        categoryFilter.setAdapter(new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_dropdown_item, categories));
        sortSelect.setAdapter(new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_dropdown_item,
                Arrays.asList(getString(R.string.sort_newest), getString(R.string.sort_oldest))));

        findViewById(R.id.backButton).setOnClickListener(v -> finish());
        findViewById(R.id.sessionsButton).setOnClickListener(v ->
                startActivity(new Intent(this, SessionsActivity.class)));
        findViewById(R.id.addButton).setOnClickListener(v ->
                EditItemDialog.show(this, store, session, null, this::refresh));
        findViewById(R.id.exportButton).setOnClickListener(v ->
                showExportSheet(session, this::refresh));
        searchClear.setOnClickListener(v -> {
            search.setText("");
            query = "";
            refresh();
        });

        search.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {
            }

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                query = s.toString();
                pageSize = 100;
                refresh();
            }

            @Override
            public void afterTextChanged(Editable s) {
            }
        });

        filterAll.setOnClickListener(v -> setFilter(0));
        filterDuplicates.setOnClickListener(v -> setFilter(1));
        filterToday.setOnClickListener(v -> setFilter(2));

        categoryFilter.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(android.widget.AdapterView<?> parent, View view, int position, long id) {
                category = position == 0 ? "" : SnUtil.CATEGORIES[position - 1];
                refresh();
            }

            @Override
            public void onNothingSelected(android.widget.AdapterView<?> parent) {
            }
        });
        sortSelect.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(android.widget.AdapterView<?> parent, View view, int position, long id) {
                sort = position == 1 ? "oldest" : "newest";
                refresh();
            }

            @Override
            public void onNothingSelected(android.widget.AdapterView<?> parent) {
            }
        });
        loadMore.setOnClickListener(v -> {
            pageSize += 100;
            refresh();
        });

        if (getIntent().getBooleanExtra(EXTRA_FOCUS_SEARCH, false)) {
            search.postDelayed(() -> {
                search.requestFocus();
                android.view.inputmethod.InputMethodManager keyboard =
                        (android.view.inputmethod.InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
                if (keyboard != null) keyboard.showSoftInput(search,
                        android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT);
            }, 220L);
        }
        if (getIntent().getBooleanExtra(EXTRA_ADD, false)) {
            search.postDelayed(() -> EditItemDialog.show(this, store, session, null, this::refresh), 260L);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        ScanSession active = store.active(store.lastMode());
        if (active != null && (session == null || !active.id.equals(session.id))) {
            session = active;
            resetFilters();
        }
        if (session == null) session = store.ensure(store.lastMode());
        refresh();
    }

    private void setFilter(int which) {
        duplicatesOnly = which == 1;
        todayOnly = which == 2;
        refresh();
    }

    private void resetFilters() {
        query = "";
        category = "";
        duplicatesOnly = false;
        todayOnly = false;
        pageSize = 100;
        search.setText("");
        categoryFilter.setSelection(0);
        sortSelect.setSelection(0);
    }

    private void refresh() {
        if (session == null) return;
        TextView subtitle = findViewById(R.id.inventorySubtitle);
        subtitle.setText(session.name + " · " + session.items.size() + " item");
        searchClear.setVisibility(query.isEmpty() ? View.GONE : View.VISIBLE);

        styleChip(filterAll, !duplicatesOnly && !todayOnly);
        styleChip(filterDuplicates, duplicatesOnly);
        styleChip(filterToday, todayOnly);

        List<ScanItem> filtered = SessionOps.filter(session.items, query, category,
                duplicatesOnly, todayOnly, sort, SessionOps.startOfToday());
        int visible = Math.min(filtered.size(), pageSize);
        adapter.submit(new ArrayList<>(filtered.subList(0, visible)), session.isMatch());

        boolean empty = filtered.isEmpty();
        emptyState.setVisibility(empty ? View.VISIBLE : View.GONE);
        findViewById(R.id.itemList).setVisibility(empty ? View.GONE : View.VISIBLE);
        if (empty) {
            if (session.items.isEmpty()) {
                emptyTitle.setText(R.string.empty_collect_title);
                emptyBody.setText(R.string.empty_collect_body);
            } else {
                emptyTitle.setText(R.string.empty_search);
                emptyBody.setText("");
            }
        }
        boolean more = filtered.size() > pageSize;
        loadMore.setVisibility(more ? View.VISIBLE : View.GONE);
        loadMore.setText(getString(R.string.load_more_count, Math.max(0, filtered.size() - pageSize)));
    }

    private void styleChip(TextView chip, boolean active) {
        chip.setBackgroundResource(active ? R.drawable.bg_chip_active : R.drawable.bg_chip);
        chip.setTextColor(ContextCompat.getColor(this, active ? R.color.white : R.color.ink_soft));
    }

    @Override
    public void onRow(ScanItem item) {
        ItemDetailDialog.show(this, store, session, item, this::refresh, () -> {
            Intent intent = new Intent(this, ScannerActivity.class);
            intent.putExtra(ScannerActivity.EXTRA_MODE, session.mode);
            startActivity(intent);
        });
    }
}
