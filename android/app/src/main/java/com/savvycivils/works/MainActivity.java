package com.savvycivils.works;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins that live in this app (rather than in an npm package) have to
        // be registered by hand, before the bridge starts.
        registerPlugin(AppPermissionsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
