package com.glance.app;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.MediaStore;

import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Uninstall-proof mirror of the learning data in shared storage.
 * Default target: Documents/Glance/ via MediaStore (no permission on API 29+).
 * Optional target: a user-picked SAF tree. API keys never enter the mirror.
 */
@CapacitorPlugin(
    name = "GlanceStorage",
    permissions = {
        @Permission(strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE, Manifest.permission.READ_EXTERNAL_STORAGE }, alias = "storage")
    }
)
public class GlanceStorage extends Plugin {

    private static final String NAME = "Glance-learning-data.json";
    private static final String REL = "Documents/Glance/";
    private static final int RC_TREE = 9001;
    private PluginCall pendingPick;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences("glance_storage", Activity.MODE_PRIVATE);
    }

    private Uri treeUri() {
        String s = prefs().getString("tree", null);
        if (s == null) return null;
        try { return Uri.parse(s); } catch (Exception e) { return null; }
    }

    private boolean hasStoragePermission() {
        if (Build.VERSION.SDK_INT >= 29) return true;
        return getContext().checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
            && getContext().checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    private File legacyFile() {
        return new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), "Glance/" + NAME);
    }

    private Uri defaultUri() {
        if (Build.VERSION.SDK_INT < 29) return null;
        Cursor c = null;
        try {
            c = getContext().getContentResolver().query(
                MediaStore.Files.getContentUri("external"),
                new String[]{ MediaStore.Files.FileColumns._ID, MediaStore.Files.FileColumns.DATE_MODIFIED },
                MediaStore.Files.FileColumns.RELATIVE_PATH + "=? AND " + MediaStore.Files.FileColumns.DISPLAY_NAME + "=?",
                new String[]{ REL, NAME }, null);
            if (c != null && c.moveToFirst()) {
                long id = c.getLong(0);
                return android.content.ContentUris.withAppendedId(MediaStore.Files.getContentUri("external"), id);
            }
        } catch (Exception e) {
            // fall through: treated as absent
        } finally {
            if (c != null) c.close();
        }
        return null;
    }

    private long defaultTs() {
        if (Build.VERSION.SDK_INT < 29) {
            File f = legacyFile();
            return f.exists() ? f.lastModified() : 0;
        }
        Cursor c = null;
        try {
            c = getContext().getContentResolver().query(
                MediaStore.Files.getContentUri("external"),
                new String[]{ MediaStore.Files.FileColumns.DATE_MODIFIED },
                MediaStore.Files.FileColumns.RELATIVE_PATH + "=? AND " + MediaStore.Files.FileColumns.DISPLAY_NAME + "=?",
                new String[]{ REL, NAME }, null);
            if (c != null && c.moveToFirst()) return c.getLong(0) * 1000L;
        } catch (Exception e) {
            // absent
        } finally {
            if (c != null) c.close();
        }
        return 0;
    }

    private DocumentFile treeFile(boolean create) {
        Uri tree = treeUri();
        if (tree == null) return null;
        try {
            DocumentFile root = DocumentFile.fromTreeUri(getContext(), tree);
            if (root == null || !root.canWrite()) return null;
            DocumentFile f = root.findFile(NAME);
            if (f == null && create) f = root.createFile("application/json", NAME);
            return f;
        } catch (Exception e) {
            return null;
        }
    }

    private String readStream(InputStream in) throws Exception {
        BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = r.readLine()) != null) sb.append(line).append('\n');
        r.close();
        return sb.toString();
    }

    private void writeStream(OutputStream out, String json) throws Exception {
        out.write(json.getBytes(StandardCharsets.UTF_8));
        out.flush();
        out.close();
    }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("sdk", Build.VERSION.SDK_INT);
        ret.put("defaultPath", Build.VERSION.SDK_INT >= 29 ? REL + NAME : legacyFile().getAbsolutePath());
        Uri tree = treeUri();
        ret.put("custom", tree == null ? null : tree.toString());
        DocumentFile tf = treeFile(false);
        ret.put("hasCustom", tf != null);
        ret.put("customTs", tf != null ? tf.lastModified() : 0);
        boolean hasDefault = Build.VERSION.SDK_INT >= 29 ? defaultUri() != null : legacyFile().exists();
        ret.put("hasDefault", hasDefault);
        ret.put("defaultTs", defaultTs());
        call.resolve(ret);
    }

    @PluginMethod
    public void writeMirror(PluginCall call) {
        String json = call.getString("json");
        if (json == null || json.isEmpty()) { call.reject("empty payload"); return; }
        if (!hasStoragePermission()) {
            requestPermissionForAlias("storage", call, "mirrorPerms");
            return;
        }
        try {
            DocumentFile tf = treeFile(true);
            if (tf != null) {
                OutputStream out = getContext().getContentResolver().openOutputStream(tf.getUri(), "wt");
                if (out == null) { call.reject("cannot open custom file"); return; }
                writeStream(out, json);
                JSObject ret = new JSObject();
                ret.put("source", "custom");
                ret.put("path", tf.getUri().toString());
                ret.put("ts", System.currentTimeMillis());
                call.resolve(ret);
                return;
            }
            if (Build.VERSION.SDK_INT >= 29) {
                Uri u = defaultUri();
                if (u == null) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Files.FileColumns.DISPLAY_NAME, NAME);
                    v.put(MediaStore.Files.FileColumns.RELATIVE_PATH, REL);
                    v.put(MediaStore.Files.FileColumns.MIME_TYPE, "application/json");
                    v.put(MediaStore.Files.FileColumns.IS_PENDING, 1);
                    u = getContext().getContentResolver().insert(MediaStore.Files.getContentUri("external"), v);
                    if (u == null) { call.reject("MediaStore insert failed"); return; }
                    OutputStream out = getContext().getContentResolver().openOutputStream(u);
                    if (out == null) { call.reject("cannot open MediaStore file"); return; }
                    writeStream(out, json);
                    ContentValues done = new ContentValues();
                    done.put(MediaStore.Files.FileColumns.IS_PENDING, 0);
                    getContext().getContentResolver().update(u, done, null, null);
                } else {
                    OutputStream out = getContext().getContentResolver().openOutputStream(u, "wt");
                    if (out == null) { call.reject("cannot open MediaStore file"); return; }
                    writeStream(out, json);
                }
                JSObject ret = new JSObject();
                ret.put("source", "default");
                ret.put("path", REL + NAME);
                ret.put("ts", System.currentTimeMillis());
                call.resolve(ret);
            } else {
                File f = legacyFile();
                //noinspection ResultOfMethodCallIgnored
                f.getParentFile().mkdirs();
                writeStream(new FileOutputStream(f), json);
                JSObject ret = new JSObject();
                ret.put("source", "default");
                ret.put("path", f.getAbsolutePath());
                ret.put("ts", System.currentTimeMillis());
                call.resolve(ret);
            }
        } catch (Exception e) {
            call.reject("mirror write failed: " + e.getMessage());
        }
    }

    @PermissionCallback
    private void mirrorPerms(PluginCall call) {
        if (!hasStoragePermission()) { call.reject("storage permission denied"); return; }
        writeMirror(call);
    }

    @PluginMethod
    public void readMirror(PluginCall call) {
        if (!hasStoragePermission()) {
            requestPermissionForAlias("storage", call, "readPerms");
            return;
        }
        try {
            DocumentFile tf = treeFile(false);
            if (tf != null) {
                InputStream in = getContext().getContentResolver().openInputStream(tf.getUri());
                if (in != null) {
                    String json = readStream(in);
                    JSObject ret = new JSObject();
                    ret.put("found", true);
                    ret.put("source", "custom");
                    ret.put("path", tf.getUri().toString());
                    ret.put("ts", tf.lastModified());
                    ret.put("json", json);
                    call.resolve(ret);
                    return;
                }
            }
            String json = null;
            long ts = 0;
            String path = null;
            if (Build.VERSION.SDK_INT >= 29) {
                Uri u = defaultUri();
                if (u != null) {
                    InputStream in = getContext().getContentResolver().openInputStream(u);
                    if (in != null) { json = readStream(in); ts = defaultTs(); path = REL + NAME; }
                }
            } else {
                File f = legacyFile();
                if (f.exists()) {
                    json = readStream(new java.io.FileInputStream(f));
                    ts = f.lastModified();
                    path = f.getAbsolutePath();
                }
            }
            JSObject ret = new JSObject();
            ret.put("found", json != null);
            ret.put("source", "default");
            ret.put("path", path);
            ret.put("ts", ts);
            ret.put("json", json);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("mirror read failed: " + e.getMessage());
        }
    }

    @PermissionCallback
    private void readPerms(PluginCall call) {
        if (!hasStoragePermission()) { call.reject("storage permission denied"); return; }
        readMirror(call);
    }

    @PluginMethod
    public void pickFolder(PluginCall call) {
        pendingPick = call;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
            | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(intent, RC_TREE);
    }

    @Override
    public void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != RC_TREE || pendingPick == null) return;
        PluginCall call = pendingPick;
        pendingPick = null;
        if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.resolve(new JSObject().put("canceled", true));
            return;
        }
        Uri uri = data.getData();
        try {
            getContext().getContentResolver().takePersistableUriPermission(
                uri, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (Exception e) {
            call.reject("cannot persist folder permission: " + e.getMessage());
            return;
        }
        prefs().edit().putString("tree", uri.toString()).apply();
        DocumentFile root = DocumentFile.fromTreeUri(getContext(), uri);
        JSObject ret = new JSObject();
        ret.put("canceled", false);
        ret.put("uri", uri.toString());
        ret.put("name", root == null ? uri.toString() : root.getName());
        call.resolve(ret);
    }

    @PluginMethod
    public void clearFolder(PluginCall call) {
        Uri uri = treeUri();
        if (uri != null) {
            try {
                getContext().getContentResolver().releasePersistableUriPermission(
                    uri, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            } catch (Exception e) {
                // grant already gone (e.g. after reinstall)
            }
        }
        prefs().edit().remove("tree").apply();
        call.resolve(new JSObject().put("ok", true));
    }
}