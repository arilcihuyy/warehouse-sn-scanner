package io.github.arilcihuyy.snscanner;

import android.os.Bundle;

import androidx.appcompat.app.AppCompatActivity;

/** Short in-app guide. */
public class HelpActivity extends AppCompatActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_help);
        findViewById(R.id.backButton).setOnClickListener(v -> finish());
    }
}
