package io.github.arilcihuyy.snscanner;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.View;
import android.view.animation.DecelerateInterpolator;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {
    private static final long TYPE_DELAY = 46L;
    private static final long TYPE_PUNCTUATION_DELAY = 145L;
    private static final long DELETE_DELAY = 24L;
    private static final long HOLD_DELAY = 2500L;
    private static final String CURSOR = "▌";

    private Store store;
    private TextView greeting;
    private View scanCard;
    private View inventoryCard;
    private View manualCard;
    private String[] greetings;
    private final Handler greetingHandler = new Handler(Looper.getMainLooper());
    private int greetingIndex;
    private int greetingChars;
    private boolean greetingDeleting;

    private final Runnable greetingStep = new Runnable() {
        @Override
        public void run() {
            if (greeting == null || greetings == null || greetings.length == 0) return;
            String phrase = greetings[greetingIndex];
            if (!greetingDeleting) {
                greetingChars = Math.min(phrase.length(), greetingChars + 1);
                greeting.setText(phrase.substring(0, greetingChars) + CURSOR);
                if (greetingChars >= phrase.length()) {
                    greetingDeleting = true;
                    greetingHandler.postDelayed(this, HOLD_DELAY);
                    return;
                }
                char last = phrase.charAt(greetingChars - 1);
                greetingHandler.postDelayed(this,
                        ".,!?".indexOf(last) >= 0 ? TYPE_PUNCTUATION_DELAY : TYPE_DELAY);
                return;
            }
            greetingChars = Math.max(0, greetingChars - 1);
            greeting.setText(phrase.substring(0, greetingChars) + CURSOR);
            if (greetingChars == 0) {
                greetingDeleting = false;
                greetingIndex = (greetingIndex + 1) % greetings.length;
                greetingHandler.postDelayed(this, 320L);
                return;
            }
            greetingHandler.postDelayed(this, DELETE_DELAY);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        store = Store.get(this);

        scanCard = findViewById(R.id.scanCard);
        inventoryCard = findViewById(R.id.inventoryCard);
        manualCard = findViewById(R.id.manualCard);
        greeting = findViewById(R.id.homeGreeting);
        greetings = new String[]{
                getString(R.string.home_greeting_1),
                getString(R.string.home_greeting_2),
                getString(R.string.home_greeting_3)
        };

        findViewById(R.id.helpButton).setOnClickListener(v ->
                openActivity(new Intent(this, HelpActivity.class)));
        findViewById(R.id.profileButton).setOnClickListener(v ->
                openActivity(new Intent(this, SettingsActivity.class)));
        findViewById(R.id.homeSearchButton).setOnClickListener(v -> {
            Intent intent = new Intent(this, InventoryActivity.class);
            intent.putExtra(InventoryActivity.EXTRA_FOCUS_SEARCH, true);
            openActivity(intent);
        });
        findViewById(R.id.sessionsLink).setOnClickListener(v ->
                openActivity(new Intent(this, SessionsActivity.class)));
        findViewById(R.id.sessionCard).setOnClickListener(v ->
                openActivity(new Intent(this, SessionsActivity.class)));

        scanCard.setOnClickListener(v -> {
            Intent intent = new Intent(this, ScannerActivity.class);
            intent.putExtra(ScannerActivity.EXTRA_MODE, store.lastMode());
            openActivity(intent);
        });
        inventoryCard.setOnClickListener(v ->
                openActivity(new Intent(this, InventoryActivity.class)));
        manualCard.setOnClickListener(v -> {
            Intent intent = new Intent(this, InventoryActivity.class);
            intent.putExtra(InventoryActivity.EXTRA_ADD, true);
            openActivity(intent);
        });

        TextView footer = findViewById(R.id.versionFooter);
        footer.setText(getString(R.string.version_footer, versionName()));
    }

    @Override
    protected void onResume() {
        super.onResume();
        renderSessionCard();
        startGreeting();
        animateCards();
    }

    @Override
    protected void onPause() {
        super.onPause();
        stopGreeting();
        resetCardPositions();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        stopGreeting();
    }

    private void renderSessionCard() {
        String mode = store.lastMode();
        ScanSession session = store.active(mode);
        TextView modeLabel = findViewById(R.id.sessionMode);
        TextView name = findViewById(R.id.sessionName);
        TextView stats = findViewById(R.id.sessionStats);
        modeLabel.setText(session != null && session.isMatch()
                ? R.string.mode_match_title : R.string.mode_collect_title);
        if (session == null) {
            name.setText(R.string.no_session);
            stats.setText(R.string.session_stats_empty);
            return;
        }
        SessionOps.Summary summary = SessionOps.summary(session);
        name.setText(session.name);
        stats.setText(getString(R.string.session_stats, summary.unique, summary.totalScans, summary.duplicates));
    }

    private void openActivity(Intent intent) {
        startActivity(intent);
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
    }

    private void startGreeting() {
        stopGreeting();
        greetingChars = 0;
        greetingIndex = 0;
        greetingDeleting = false;
        if (!animationsEnabled()) {
            greeting.setText(greetings[0]);
            return;
        }
        greeting.setText(CURSOR);
        greetingHandler.postDelayed(greetingStep, 280L);
    }

    private void stopGreeting() {
        greetingHandler.removeCallbacks(greetingStep);
    }

    private void animateCards() {
        resetCardPositions();
        boolean enabled = animationsEnabled();
        if (!enabled) {
            scanCard.setAlpha(1f);
            scanCard.setTranslationY(0f);
            inventoryCard.setAlpha(1f);
            inventoryCard.setTranslationY(0f);
            manualCard.setAlpha(1f);
            manualCard.setTranslationY(0f);
            return;
        }

        scanCard.setAlpha(0f);
        scanCard.setTranslationY(dp(20));
        inventoryCard.setAlpha(0f);
        inventoryCard.setTranslationY(dp(20));
        manualCard.setAlpha(0f);
        manualCard.setTranslationY(dp(20));
        scanCard.animate().alpha(1f).translationY(0f)
                .setStartDelay(90L).setDuration(430L)
                .setInterpolator(new DecelerateInterpolator()).start();
        inventoryCard.animate().alpha(1f).translationY(0f)
                .setStartDelay(170L).setDuration(430L)
                .setInterpolator(new DecelerateInterpolator()).start();
        manualCard.animate().alpha(1f).translationY(0f)
                .setStartDelay(250L).setDuration(430L)
                .setInterpolator(new DecelerateInterpolator()).start();
    }

    private void resetCardPositions() {
        if (scanCard != null) {
            scanCard.animate().cancel();
            scanCard.setTranslationY(0f);
        }
        if (inventoryCard != null) {
            inventoryCard.animate().cancel();
            inventoryCard.setTranslationY(0f);
        }
        if (manualCard != null) {
            manualCard.animate().cancel();
            manualCard.setTranslationY(0f);
        }
    }

    private boolean animationsEnabled() {
        return Settings.Global.getFloat(getContentResolver(),
                Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f;
    }

    private float dp(float value) {
        return value * getResources().getDisplayMetrics().density;
    }

    private String versionName() {
        try {
            String name = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            return name == null ? "4.0.0" : name;
        } catch (Exception ignored) {
            return "4.0.0";
        }
    }
}
