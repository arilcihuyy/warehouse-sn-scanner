package io.github.arilcihuyy.snscanner;

import android.os.Bundle;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.materialswitch.MaterialSwitch;

/** Profile / settings sheet from the web top bar. */
public class SettingsActivity extends AppCompatActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_settings);
        Store store = Store.get(this);

        findViewById(R.id.backButton).setOnClickListener(v -> finish());
        MaterialSwitch sound = findViewById(R.id.soundToggle);
        MaterialSwitch vibration = findViewById(R.id.vibrationToggle);
        sound.setChecked(store.soundEnabled());
        vibration.setChecked(store.vibrationEnabled());
        sound.setOnCheckedChangeListener((buttonView, checked) -> store.setSoundEnabled(checked));
        vibration.setOnCheckedChangeListener((buttonView, checked) -> store.setVibrationEnabled(checked));

        TextView version = findViewById(R.id.settingsVersion);
        version.setText("StockScan " + versionName());
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
