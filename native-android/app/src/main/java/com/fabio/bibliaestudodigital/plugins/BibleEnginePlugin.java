package com.fabio.bibliaestudodigital.plugins;

import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "BibleEngine")
public class BibleEnginePlugin extends Plugin {

    private static final int MAX_OPEN_DBS = 14;
    private final ExecutorService executor = Executors.newFixedThreadPool(4);

    private final Map<String, SQLiteDatabase> dbPool =
        new LinkedHashMap<String, SQLiteDatabase>(16, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, SQLiteDatabase> eldest) {
                if (size() > MAX_OPEN_DBS) {
                    SQLiteDatabase oldDb = eldest.getValue();
                    if (oldDb != null && oldDb.isOpen()) {
                        try { oldDb.close(); } catch (Exception ignored) {}
                    }
                    return true;
                }
                return false;
            }
        };

    private synchronized SQLiteDatabase getReadOnlyDb(String path) {
        SQLiteDatabase db = dbPool.get(path);
        if (db != null && db.isOpen()) {
            return db;
        }
        int flags = SQLiteDatabase.OPEN_READONLY | SQLiteDatabase.NO_LOCALIZED_COLLATORS;
        db = SQLiteDatabase.openDatabase(path, null, flags);
        dbPool.put(path, db);
        return db;
    }

    @PluginMethod
    public void checkStoragePermission(PluginCall call) {
        boolean granted = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            granted = Environment.isExternalStorageManager();
        }
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        ret.put("sdkInt", Build.VERSION.SDK_INT);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestStoragePermission(PluginCall call) {
        if (getActivity() == null) {
            call.reject("Activity indisponível");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            try {
                getActivity().startActivity(intent);
            } catch (Exception e) {
                Intent fallback = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                getActivity().startActivity(fallback);
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void getDiagnostics(PluginCall call) {
        executor.execute(() -> {
            JSObject ret = new JSObject();
            ret.put("deviceModel", Build.MANUFACTURER + " " + Build.MODEL);
            ret.put("androidVersion", Build.VERSION.RELEASE);
            ret.put("sdkInt", Build.VERSION.SDK_INT);
            ret.put("volumes", ModuleScanner.getStorageVolumes(getContext()));
            ret.put("maxPoolSize", MAX_OPEN_DBS);
            ret.put("currentPoolOpen", dbPool.size());

            SQLiteDatabase memDb = null;
            try {
                memDb = SQLiteDatabase.create(null);
                try (Cursor c = memDb.rawQuery("SELECT sqlite_version()", null)) {
                    if (c.moveToFirst()) ret.put("sqliteVersion", c.getString(0));
                }
                boolean fts5 = false;
                try {
                    memDb.execSQL("CREATE VIRTUAL TABLE _t USING fts5(content)");
                    fts5 = true;
                } catch (Exception ignored) {}
                ret.put("fts5Supported", fts5);
            } catch (Exception e) {
                ret.put("sqliteVersion", "erro: " + e.getMessage());
                ret.put("fts5Supported", false);
            } finally {
                if (memDb != null) memDb.close();
            }
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void scanDirectory(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.trim().isEmpty()) {
            call.reject("Informe o caminho da pasta de módulos.");
            return;
        }
        executor.execute(() -> {
            long start = System.currentTimeMillis();
            File dir = new File(path);
            if (!dir.exists() || !dir.isDirectory()) {
                call.reject("Pasta não encontrada ou sem acesso: " + path);
                return;
            }
            JSArray files = new JSArray();
            ModuleScanner.scanRecursive(dir, files);

            JSObject ret = new JSObject();
            ret.put("path", path);
            ret.put("total", files.length());
            ret.put("durationMs", System.currentTimeMillis() - start);
            ret.put("files", files);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void inspectSqliteModule(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("Caminho do arquivo ausente.");
            return;
        }
        executor.execute(() -> {
            long start = System.currentTimeMillis();
            try {
                SQLiteDatabase db = getReadOnlyDb(path);
                JSArray tables = new JSArray();
                try (Cursor c = db.rawQuery(
                        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", null)) {
                    while (c.moveToNext()) {
                        tables.put(c.getString(0));
                    }
                }
                JSObject ret = new JSObject();
                ret.put("path", path);
                ret.put("openMs", System.currentTimeMillis() - start);
                ret.put("poolOpenCount", dbPool.size());
                ret.put("tables", tables);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Falha ao abrir SQLite: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void queryModule(PluginCall call) {
        String path = call.getString("path");
        String sql = call.getString("sql");
        JSArray argsArr = call.getArray("args");

        if (path == null || sql == null) {
            call.reject("Parâmetros path e sql são obrigatórios.");
            return;
        }
        String check = sql.trim().toUpperCase(Locale.ROOT);
        if (!check.startsWith("SELECT") && !check.startsWith("PRAGMA")) {
            call.reject("Apenas consultas SELECT ou PRAGMA são permitidas nos módulos.");
            return;
        }

        executor.execute(() -> {
            long start = System.currentTimeMillis();
            try {
                SQLiteDatabase db = getReadOnlyDb(path);
                String[] args = null;
                if (argsArr != null && argsArr.length() > 0) {
                    args = new String[argsArr.length()];
                    for (int i = 0; i < argsArr.length(); i++) {
                        args[i] = argsArr.getString(i);
                    }
                }
                JSArray rows = new JSArray();
                try (Cursor c = db.rawQuery(sql, args)) {
                    String[] cols = c.getColumnNames();
                    while (c.moveToNext()) {
                        JSObject row = new JSObject();
                        for (int i = 0; i < cols.length; i++) {
                            int type = c.getType(i);
                            if (type == Cursor.FIELD_TYPE_NULL) {
                                row.put(cols[i], null);
                            } else if (type == Cursor.FIELD_TYPE_INTEGER) {
                                row.put(cols[i], c.getLong(i));
                            } else if (type == Cursor.FIELD_TYPE_FLOAT) {
                                row.put(cols[i], c.getDouble(i));
                            } else if (type == Cursor.FIELD_TYPE_STRING) {
                                row.put(cols[i], c.getString(i));
                            } else if (type == Cursor.FIELD_TYPE_BLOB) {
                                byte[] blob = c.getBlob(i);
                                row.put(cols[i], "[BLOB " + (blob != null ? blob.length : 0) + " bytes]");
                            }
                        }
                        rows.put(row);
                    }
                }
                JSObject ret = new JSObject();
                ret.put("queryMs", System.currentTimeMillis() - start);
                ret.put("rowCount", rows.length());
                ret.put("rows", rows);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Erro na consulta SQL: " + e.getMessage());
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (this) {
            for (SQLiteDatabase db : dbPool.values()) {
                if (db != null && db.isOpen()) {
                    try { db.close(); } catch (Exception ignored) {}
                }
            }
            dbPool.clear();
        }
        executor.shutdownNow();
        super.handleOnDestroy();
    }
}
