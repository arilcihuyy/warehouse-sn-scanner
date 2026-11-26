package io.github.arilcihuyy.snscanner;

import android.content.Intent;
import android.os.Bundle;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {
    private Store store;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        store = Store.get(this);

        findViewById(R.id.matchCard).setOnClickListener(v ->
                startActivity(new Intent(this, MatchActivity.class)));
        findViewById(R.id.collectCard).setOnClickListener(v ->
                startActivity(new Intent(this, CollectActivity.class)));

        TextView footer = findViewById(R.id.versionFooter);
        footer.setText(R.string.version_footer);
    }

    @Override
    protected void onResume() {
        super.onResume();
        MatchSession match = store.getMatch();
        TextView matchStats = findViewById(R.id.matchStats);
        if (match == null || match.items.isEmpty()) {
            matchStats.setText(R.string.no_session);
        } else {
            matchStats.setText(getString(R.string.match_count, match.remainingCount(), match.items.size())
                    + " · " + match.foundCount() + " " + getString(R.string.found).toLowerCase());
        }

        CollectSession collect = store.getCollect();
        TextView collectStats = findViewById(R.id.collectStats);
        if (collect == null || collect.items.isEmpty()) {
            collectStats.setText(R.string.no_session);
        } else {
            collectStats.setText(getString(R.string.collect_count, collect.items.size(), collect.brandCount()));
        }
    }
}
