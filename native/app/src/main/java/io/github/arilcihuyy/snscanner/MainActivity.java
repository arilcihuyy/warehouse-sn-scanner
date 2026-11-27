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

import android.animation.ObjectAnimator;

public class MainActivity extends AppCompatActivity {
    private static final long TYPE_DELAY = 46L;
    private static final long TYPE_PUNCTUATION_DELAY = 145L;
    private static final long DELETE_DELAY = 24L;
    private static final long HOLD_DELAY = 2500L;
    private static final String CURSOR = "▌";

    private Store store;
    private TextView greeting;
    private View matchCard;
    private View collectCard;
    private String[] greetings;
    private final Handler greetingHandler = new Handler(Looper.getMainLooper());
    private ObjectAnimator matchFloat;
    private ObjectAnimator collectFloat;
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

        matchCard = findViewById(R.id.matchCard);
        collectCard = findViewById(R.id.collectCard);
        greeting = findViewById(R.id.homeGreeting);
        greetings = new String[]{
                getString(R.string.home_greeting_1),
                getString(R.string.home_greeting_2),
                getString(R.string.home_greeting_3)
        };

        matchCard.setOnClickListener(v -> openActivity(MatchActivity.class));
        collectCard.setOnClickListener(v -> openActivity(CollectActivity.class));
        findViewById(R.id.homeSearchButton).setOnClickListener(v -> {
            Intent intent = new Intent(this, CollectActivity.class);
            intent.putExtra(CollectActivity.EXTRA_FOCUS_SEARCH, true);
            startActivity(intent);
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
        });

        TextView footer = findViewById(R.id.versionFooter);
        footer.setText(getString(R.string.version_footer, versionName()));
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

        startGreeting();
        animateCards();
    }

    @Override
    protected void onPause() {
        super.onPause();
        stopGreeting();
        stopFloat();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        stopGreeting();
    }

    private void openActivity(Class<?> activity) {
        startActivity(new Intent(this, activity));
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
        stopFloat();
        boolean enabled = animationsEnabled();
        if (!enabled) {
            matchCard.setAlpha(1f);
            matchCard.setTranslationY(0f);
            collectCard.setAlpha(1f);
            collectCard.setTranslationY(0f);
            return;
        }

        matchCard.setAlpha(0f);
        matchCard.setTranslationY(dp(18));
        collectCard.setAlpha(0f);
        collectCard.setTranslationY(dp(18));
        matchCard.animate().alpha(1f).translationY(0f)
                .setStartDelay(120L).setDuration(430L)
                .setInterpolator(new DecelerateInterpolator()).start();
        collectCard.animate().alpha(1f).translationY(0f)
                .setStartDelay(210L).setDuration(430L)
                .setInterpolator(new DecelerateInterpolator()).start();

        matchFloat = ObjectAnimator.ofFloat(matchCard, "translationY", 0f, -dp(3), 0f);
        matchFloat.setDuration(5200L);
        matchFloat.setStartDelay(900L);
        matchFloat.setRepeatCount(ObjectAnimator.INFINITE);
        matchFloat.setInterpolator(new android.view.animation.AccelerateDecelerateInterpolator());
        matchFloat.start();

        collectFloat = ObjectAnimator.ofFloat(collectCard, "translationY", 0f, -dp(3), 0f);
        collectFloat.setDuration(5200L);
        collectFloat.setStartDelay(2000L);
        collectFloat.setRepeatCount(ObjectAnimator.INFINITE);
        collectFloat.setInterpolator(new android.view.animation.AccelerateDecelerateInterpolator());
        collectFloat.start();
    }

    private void stopFloat() {
        if (matchFloat != null) {
            matchFloat.cancel();
            matchFloat = null;
        }
        if (collectFloat != null) {
            collectFloat.cancel();
            collectFloat = null;
        }
        if (matchCard != null) matchCard.setTranslationY(0f);
        if (collectCard != null) collectCard.setTranslationY(0f);
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
            return name == null ? "3.0.0" : name;
        } catch (Exception ignored) {
            return "3.0.0";
        }
    }
}
