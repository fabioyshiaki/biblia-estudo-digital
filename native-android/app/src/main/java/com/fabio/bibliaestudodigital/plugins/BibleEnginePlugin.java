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
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "BibleEngine")
public class BibleEnginePlugin extends Plugin {

    private static final int MAX_OPEN_DBS = 14;
    private final ExecutorService executor = Executors.newFixedThreadPool(4);
    private CatalogDatabase catalogDb;
    private UserDataDatabase userDataDb;

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

    @Override
    public void load() {
        catalogDb = new CatalogDatabase(getContext());
        userDataDb = new UserDataDatabase(getContext());
    }

    private synchronized SQLiteDatabase getReadOnlyDb(String path) {
        SQLiteDatabase db = dbPool.get(path);
        if (db != null && db.isOpen()) return db;
        int flags = SQLiteDatabase.OPEN_READONLY | SQLiteDatabase.NO_LOCALIZED_COLLATORS;
        db = SQLiteDatabase.openDatabase(path, null, flags);
        dbPool.put(path, db);
        return db;
    }

    private synchronized void closePool() {
        for (SQLiteDatabase db : dbPool.values()) {
            if (db != null && db.isOpen()) {
                try { db.close(); } catch (Exception ignored) {}
            }
        }
        dbPool.clear();
    }

    private static String formatDeviceModel() {
        String mfg = Build.MANUFACTURER != null ? Build.MANUFACTURER.trim() : "";
        String model = Build.MODEL != null ? Build.MODEL.trim() : "";
        if (model.toLowerCase(Locale.ROOT).startsWith(mfg.toLowerCase(Locale.ROOT))) {
            return model;
        }
        return (mfg + " " + model).trim();
    }

    @PluginMethod
    public void checkStoragePermission(PluginCall call) {
        boolean granted = Build.VERSION.SDK_INT < Build.VERSION_CODES.R || Environment.isExternalStorageManager();
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        ret.put("sdkInt", Build.VERSION.SDK_INT);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestStoragePermission(PluginCall call) {
        if (getActivity() == null) { call.reject("Activity indisponível"); return; }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            try {
                getActivity().startActivity(intent);
            } catch (Exception e) {
                getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION));
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void getDiagnostics(PluginCall call) {
        executor.execute(() -> {
            JSObject ret = new JSObject();
            ret.put("deviceModel", formatDeviceModel());
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
                try { memDb.execSQL("CREATE VIRTUAL TABLE _t USING fts5(content)"); fts5 = true; }
                catch (Exception ignored) {}
                ret.put("fts5Supported", fts5);
            } catch (Exception e) {
                ret.put("sqliteVersion", "erro");
                ret.put("fts5Supported", false);
            } finally {
                if (memDb != null) memDb.close();
            }
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void getFolders(PluginCall call) {
        executor.execute(() -> {
            JSObject ret = new JSObject();
            ret.put("folders", catalogDb.getFolders());
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void saveFolders(PluginCall call) {
        JSArray folders = call.getArray("folders");
        if (folders == null) { call.reject("Lista de pastas ausente."); return; }
        executor.execute(() -> {
            catalogDb.saveFolders(folders);
            call.resolve();
        });
    }

    @PluginMethod
    public void syncCatalog(PluginCall call) {
        boolean force = Boolean.TRUE.equals(call.getBoolean("force", false));
        executor.execute(() -> {
            JSArray saved = catalogDb.getFolders();
            List<String> paths = new ArrayList<>();
            for (int i = 0; i < saved.length(); i++) {
                org.json.JSONObject f = saved.optJSONObject(i);
                if (f != null && f.optBoolean("enabled", true)) {
                    paths.add(f.optString("path"));
                }
            }
            call.resolve(CatalogIndexer.syncFolders(catalogDb, paths, force));
        });
    }

    @PluginMethod
    public void getCatalog(PluginCall call) {
        executor.execute(() -> {
            JSObject ret = new JSObject();
            ret.put("modules", catalogDb.getAllModules());
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void setModuleFavorite(PluginCall call) {
        String id = call.getString("id");
        boolean fav = Boolean.TRUE.equals(call.getBoolean("favorite", false));
        if (id == null) { call.reject("ID ausente."); return; }
        executor.execute(() -> {
            catalogDb.setFavorite(id, fav);
            call.resolve();
        });
    }

    @PluginMethod
    public void buildCoverageMap(PluginCall call) {
        executor.execute(() -> call.resolve(CatalogIndexer.buildCoverageForPending(catalogDb)));
    }

    @PluginMethod
    public void getCoverageForBook(PluginCall call) {
        Integer bookId = call.getInt("bookId");
        String type = call.getString("type", "");
        if (bookId == null) { call.reject("bookId obrigatório."); return; }
        executor.execute(() -> {
            JSObject ret = new JSObject();
            ret.put("modules", catalogDb.getModulesForBook(bookId, type));
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void getModuleSets(PluginCall call) {
        executor.execute(() -> {
            JSObject ret = new JSObject();
            ret.put("sets", catalogDb.getModuleSets());
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void saveModuleSet(PluginCall call) {
        String id = call.getString("id");
        String name = call.getString("name");
        String idsJson = call.getString("moduleIdsJson", "[]");
        int sortOrder = call.getInt("sortOrder", 0);
        if (id == null || name == null) { call.reject("id e name obrigatórios."); return; }
        executor.execute(() -> {
            catalogDb.saveModuleSet(id, name, idsJson, sortOrder);
            call.resolve();
        });
    }

    @PluginMethod
    public void deleteModuleSet(PluginCall call) {
        String id = call.getString("id");
        if (id == null) { call.reject("id obrigatório."); return; }
        executor.execute(() -> {
            catalogDb.deleteModuleSet(id);
            call.resolve();
        });
    }

    @PluginMethod
    public void inspectSqliteModule(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) { call.reject("Caminho ausente."); return; }
        executor.execute(() -> {
            long start = System.currentTimeMillis();
            try {
                SQLiteDatabase db = getReadOnlyDb(path);
                JSArray tables = new JSArray();
                try (Cursor c = db.rawQuery("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", null)) {
                    while (c.moveToNext()) tables.put(c.getString(0));
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
        if (path == null || sql == null) { call.reject("path e sql obrigatórios."); return; }
        String check = sql.trim().toUpperCase(Locale.ROOT);
        if (!check.startsWith("SELECT") && !check.startsWith("PRAGMA")) {
            call.reject("Apenas SELECT/PRAGMA permitidos.");
            return;
        }
        executor.execute(() -> {
            long start = System.currentTimeMillis();
            try {
                SQLiteDatabase db = getReadOnlyDb(path);
                String[] args = null;
                if (argsArr != null && argsArr.length() > 0) {
                    args = new String[argsArr.length()];
                    for (int i = 0; i < argsArr.length(); i++) args[i] = argsArr.getString(i);
                }
                JSArray rows = new JSArray();
                try (Cursor c = db.rawQuery(sql, args)) {
                    String[] cols = c.getColumnNames();
                    while (c.moveToNext()) {
                        JSObject row = new JSObject();
                        for (int i = 0; i < cols.length; i++) {
                            int t = c.getType(i);
                            if (t == Cursor.FIELD_TYPE_NULL) row.put(cols[i], null);
                            else if (t == Cursor.FIELD_TYPE_INTEGER) row.put(cols[i], c.getLong(i));
                            else if (t == Cursor.FIELD_TYPE_FLOAT) row.put(cols[i], c.getDouble(i));
                            else if (t == Cursor.FIELD_TYPE_STRING) row.put(cols[i], c.getString(i));
                            else if (t == Cursor.FIELD_TYPE_BLOB) {
                                byte[] b = c.getBlob(i);
                                row.put(cols[i], "[BLOB " + (b != null ? b.length : 0) + " bytes]");
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
                call.reject("Erro SQL: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void readTheWordChapter(PluginCall call) {
        String path = call.getString("path");
        Integer bookId = call.getInt("bookId");
        Integer chapter = call.getInt("chapter");
        if (path == null || bookId == null || chapter == null) {
            call.reject("path, bookId e chapter obrigatórios.");
            return;
        }
        executor.execute(() -> {
            try {
                call.resolve(TheWordOntReader.readChapter(path, bookId, chapter));
            } catch (Exception e) {
                call.reject("Erro ao ler módulo theWord: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void getEpubInfo(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) { call.reject("path obrigatório."); return; }
        executor.execute(() -> {
            try {
                call.resolve(EpubReader.getInfo(path));
            } catch (Exception e) {
                call.reject("Erro ao abrir EPUB: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void readEpubChapter(PluginCall call) {
        String path = call.getString("path");
        Integer index = call.getInt("chapterIndex");
        if (path == null || index == null) { call.reject("path e chapterIndex obrigatórios."); return; }
        executor.execute(() -> {
            try {
                call.resolve(EpubReader.readChapter(path, index));
            } catch (Exception e) {
                call.reject("Erro ao ler capítulo EPUB: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void getPdfInfo(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) { call.reject("path obrigatório."); return; }
        executor.execute(() -> {
            try {
                call.resolve(PdfPageReader.getInfo(path));
            } catch (Exception e) {
                call.reject("Erro ao abrir PDF: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void renderPdfPage(PluginCall call) {
        String path = call.getString("path");
        Integer pageIndex = call.getInt("pageIndex");
        int maxWidth = call.getInt("maxWidth", 1400);
        if (path == null || pageIndex == null) { call.reject("path e pageIndex obrigatórios."); return; }
        executor.execute(() -> {
            try {
                call.resolve(PdfPageReader.renderPage(path, pageIndex, maxWidth));
            } catch (Exception e) {
                call.reject("Erro ao renderizar página PDF: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void userDataAction(PluginCall call) {
        String action = call.getString("action");
        if (action == null || action.isEmpty()) {
            call.reject("action obrigatório.");
            return;
        }
        JSObject payload = call.getObject("payload");
        final JSObject safePayload = payload != null ? payload : new JSObject();
        executor.execute(() -> {
            try {
                call.resolve(userDataDb.dispatch(action, safePayload));
            } catch (Exception e) {
                call.reject("Erro em user_data.db (" + action + "): " + e.getMessage());
            }
        });
    }

    @Override
    protected void handleOnStop() {
        closePool();
        super.handleOnStop();
    }

    @Override
    protected void handleOnDestroy() {
        closePool();
        TheWordOntReader.clearCache();
        EpubReader.clearCache();
        if (catalogDb != null) catalogDb.close();
        if (userDataDb != null) userDataDb.close();
        executor.shutdownNow();
        super.handleOnDestroy();
    }
}
