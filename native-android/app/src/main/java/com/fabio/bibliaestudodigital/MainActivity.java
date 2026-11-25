package com.fabio.bibliaestudodigital;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.fabio.bibliaestudodigital.plugins.BibleEnginePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BibleEnginePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
