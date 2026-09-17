package com.savvycivils.works;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * The permissions the app needs in order to keep working when it is not the
 * thing on screen — GPS while the phone is locked or while the technician is
 * in another app.
 *
 * Android deliberately makes these awkward to get, and the awkward parts are
 * exactly what this plugin exists to handle:
 *
 *  - "Allow all the time" (ACCESS_BACKGROUND_LOCATION) is a second, separate
 *    grant from the ordinary location prompt, and from Android 11 the system
 *    refuses to show it in the same breath as the first one. It has to be
 *    asked for on its own, after the ordinary grant has landed.
 *  - From Android 11 the "Allow all the time" option is often not offered in a
 *    dialog at all; the user has to flip it on the app's own settings page. So
 *    every request here reports back what it actually achieved, and the UI
 *    falls back to walking the user into Settings when a prompt isn't enough.
 *  - Aggressive OEM battery managers (Samsung, Xiaomi, Huawei — i.e. most
 *    phones in the field) will freeze the tracking service regardless of
 *    permissions unless the app is exempted from battery optimisation.
 *
 * Registered in MainActivity.java; the JS side is
 * src/shared/services/nativePermissions.js.
 */
@CapacitorPlugin(
    name = "AppPermissions",
    permissions = {
        @Permission(
            strings = { Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION },
            alias = "location"
        ),
        @Permission(strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION }, alias = "backgroundLocation"),
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class AppPermissionsPlugin extends Plugin {

    @PluginMethod
    public void check(PluginCall call) {
        call.resolve(buildStatus());
    }

    /** The ordinary "while using the app" location grant. */
    @PluginMethod
    public void requestLocation(PluginCall call) {
        if (isGranted(Manifest.permission.ACCESS_FINE_LOCATION)) {
            call.resolve(buildStatus());
            return;
        }
        requestPermissionForAlias("location", call, "permissionResult");
    }

    /**
     * "Allow all the time". Android ignores this request entirely unless the
     * ordinary location grant is already in hand, so the caller is expected to
     * have run requestLocation() first — if it hasn't, this reports the
     * unchanged status rather than burning the one prompt the user gets.
     */
    @PluginMethod
    public void requestBackgroundLocation(PluginCall call) {
        // Before Android 10 there was no separate background grant: ordinary
        // location already covered the locked-screen case.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
            || isGranted(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
            || !isGranted(Manifest.permission.ACCESS_FINE_LOCATION)) {
            call.resolve(buildStatus());
            return;
        }
        requestPermissionForAlias("backgroundLocation", call, "permissionResult");
    }

    /**
     * Android 13+ only. Without it the ongoing "on shift" notification is
     * silently suppressed — and a foreground service the user cannot see is one
     * the system feels free to kill.
     */
    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || isGranted(Manifest.permission.POST_NOTIFICATIONS)) {
            call.resolve(buildStatus());
            return;
        }
        requestPermissionForAlias("notifications", call, "permissionResult");
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        call.resolve(buildStatus());
    }

    /** The app's own permission page — the only route to "Allow all the time" on many builds. */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        openExternal(
            call,
            new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getContext().getPackageName(), null))
        );
    }

    /** System-wide location toggle, for when GPS itself is switched off. */
    @PluginMethod
    public void openLocationSettings(PluginCall call) {
        openExternal(call, new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS));
    }

    /**
     * Asks to be exempted from battery optimisation. Tries the one-tap system
     * dialog first and falls back to the full battery-optimisation list if that
     * action is unavailable (e.g. the REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
     * permission was stripped out for a Play Store build).
     */
    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        if (isIgnoringBatteryOptimizations()) {
            call.resolve(buildStatus());
            return;
        }
        String pkg = getContext().getPackageName();
        try {
            getActivity()
                .startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + pkg)));
            call.resolve(buildStatus());
        } catch (Exception direct) {
            try {
                getActivity().startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
                call.resolve(buildStatus());
            } catch (Exception list) {
                call.reject("Battery settings are not reachable on this device.");
            }
        }
    }

    /**
     * Settings screens are a round trip out of the app, so the answer only
     * arrives once we come back. Re-broadcast the state on resume rather than
     * making every screen poll for it.
     */
    @Override
    protected void handleOnResume() {
        notifyListeners("permissionsChanged", buildStatus());
    }

    private void openExternal(PluginCall call, Intent intent) {
        try {
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("That settings screen is not available on this device.");
        }
    }

    private boolean isGranted(String permission) {
        return getContext().checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    /**
     * "granted" when the permission is actually held; otherwise Capacitor's own
     * view of it, which distinguishes a never-asked "prompt" from a hard
     * "denied" (asked and refused — only Settings will fix that one).
     */
    private String stateOf(String alias, String permission) {
        if (isGranted(permission)) return PermissionState.GRANTED.toString();
        return getPermissionState(alias).toString();
    }

    private boolean isIgnoringBatteryOptimizations() {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }

    private boolean isLocationServiceOn() {
        LocationManager lm = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) return lm.isLocationEnabled();
        return lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
    }

    private boolean areNotificationsOn() {
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        return nm == null || nm.areNotificationsEnabled();
    }

    private JSObject buildStatus() {
        JSObject status = new JSObject();
        status.put("sdkInt", Build.VERSION.SDK_INT);
        // Surfaced so the UI can add the extra note for the OEMs that stack
        // their own app-killing on top of stock Android.
        status.put("manufacturer", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER);

        String location = stateOf("location", Manifest.permission.ACCESS_FINE_LOCATION);
        status.put("location", location);

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            status.put("backgroundLocation", location);
        } else {
            status.put("backgroundLocation", stateOf("backgroundLocation", Manifest.permission.ACCESS_BACKGROUND_LOCATION));
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            status.put("notifications", areNotificationsOn() ? "granted" : "denied");
        } else {
            String notifications = stateOf("notifications", Manifest.permission.POST_NOTIFICATIONS);
            // Granted but switched off in Settings is, for our purposes, off.
            status.put("notifications", "granted".equals(notifications) && !areNotificationsOn() ? "denied" : notifications);
        }

        status.put("batteryUnrestricted", isIgnoringBatteryOptimizations());
        status.put("locationServicesEnabled", isLocationServiceOn());
        return status;
    }
}
