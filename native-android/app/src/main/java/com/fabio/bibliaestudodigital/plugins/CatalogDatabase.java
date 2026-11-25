package com.fabio.bibliaestudodigital.plugins;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class CatalogDatabase extends SQLiteOpenHelper {

    private static final String DB_NAME = "catalog.db";
    private static final int DB_VERSION = 1;

    public CatalogDatabase(Context context) {
        super(context, DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onConfigure(SQLiteDatabase db) {
        super.onConfigure(db);
        db.enableWriteAheadLogging();
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL(
            "CREATE TABLE IF NOT EXISTS library_folders (" +
            "  path TEXT PRIMARY KEY," +
            "  label TEXT NOT NULL," +
            "  enabled INTEGER NOT NULL DEFAULT 1," +
            "  added_at INTEGER NOT NULL" +
            ")"
        );
        db.execSQL(
            "CREATE TABLE IF NOT EXISTS modules (" +
            "  id TEXT PRIMARY KEY," +
            "  path TEXT NOT NULL UNIQUE," +
            "  file_name TEXT NOT NULL," +
            "  format TEXT NOT NULL," +
            "  type TEXT NOT NULL," +
            "  is_sqlite INTEGER NOT NULL DEFAULT 0," +
            "  title TEXT NOT NULL," +
            "  abbr TEXT NOT NULL," +
            "  lang TEXT NOT NULL DEFAULT ''," +
            "  description TEXT NOT NULL DEFAULT ''," +
            "  size_bytes INTEGER NOT NULL DEFAULT 0," +
            "  last_modified INTEGER NOT NULL DEFAULT 0," +
            "  has_strong INTEGER NOT NULL DEFAULT 0," +
            "  has_morph INTEGER NOT NULL DEFAULT 0," +
            "  rtl INTEGER NOT NULL DEFAULT 0," +
            "  locked INTEGER NOT NULL DEFAULT 0," +
            "  tables_csv TEXT NOT NULL DEFAULT ''," +
            "  coverage_ready INTEGER NOT NULL DEFAULT 0," +
            "  favorite INTEGER NOT NULL DEFAULT 0," +
            "  updated_at INTEGER NOT NULL" +
            ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_modules_type ON modules(type, format)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_modules_title ON modules(title)");
        db.execSQL(
            "CREATE TABLE IF NOT EXISTS coverage_map (" +
            "  module_id TEXT NOT NULL," +
            "  book_id INTEGER NOT NULL," +
            "  PRIMARY KEY (module_id, book_id)" +
            ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_cov_book ON coverage_map(book_id)");
        db.execSQL(
            "CREATE TABLE IF NOT EXISTS module_sets (" +
            "  id TEXT PRIMARY KEY," +
            "  name TEXT NOT NULL," +
            "  module_ids_json TEXT NOT NULL," +
            "  sort_order INTEGER NOT NULL DEFAULT 0," +
            "  updated_at INTEGER NOT NULL" +
            ")"
        );
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {}

    public JSArray getFolders() {
        JSArray arr = new JSArray();
        SQLiteDatabase db = getReadableDatabase();
        try (Cursor c = db.rawQuery(
                "SELECT path, label, enabled, added_at FROM library_folders ORDER BY added_at ASC", null)) {
            while (c.moveToNext()) {
                JSObject o = new JSObject();
                o.put("path", c.getString(0));
                o.put("label", c.getString(1));
                o.put("enabled", c.getInt(2) == 1);
                o.put("addedAt", c.getLong(3));
                arr.put(o);
            }
        }
        return arr;
    }

    public void saveFolders(JSArray folders) {
        SQLiteDatabase db = getWritableDatabase();
        long now = System.currentTimeMillis();
        db.beginTransaction();
        try {
            db.delete("library_folders", null, null);
            for (int i = 0; i < folders.length(); i++) {
                org.json.JSONObject item = folders.optJSONObject(i);
                if (item == null) continue;
                String path = item.optString("path", "").trim();
                if (path.isEmpty()) continue;
                ContentValues cv = new ContentValues();
                cv.put("path", path);
                cv.put("label", item.optString("label", path));
                cv.put("enabled", item.optBoolean("enabled", true) ? 1 : 0);
                cv.put("added_at", item.optLong("addedAt", now));
                db.insertWithOnConflict("library_folders", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    public Map<String, long[]> getCachedFingerprints() {
        Map<String, long[]> map = new HashMap<>();
        SQLiteDatabase db = getReadableDatabase();
        try (Cursor c = db.rawQuery(
                "SELECT path, size_bytes, last_modified, favorite, coverage_ready FROM modules", null)) {
            while (c.moveToNext()) {
                map.put(c.getString(0), new long[]{
                    c.getLong(1), c.getLong(2), c.getLong(3), c.getLong(4)
                });
            }
        }
        return map;
    }

    public void upsertModulesBatch(List<ContentValues> upserts, List<String> activePaths) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            for (ContentValues cv : upserts) {
                db.insertWithOnConflict("modules", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
            }
            // Remove módulos cujos arquivos não existem mais nas pastas escaneadas
            Map<String, Boolean> alive = new HashMap<>();
            for (String p : activePaths) alive.put(p, true);
            try (Cursor c = db.rawQuery("SELECT id, path FROM modules", null)) {
                while (c.moveToNext()) {
                    if (!alive.containsKey(c.getString(1))) {
                        String deadId = c.getString(0);
                        db.delete("modules", "id = ?", new String[]{deadId});
                        db.delete("coverage_map", "module_id = ?", new String[]{deadId});
                    }
                }
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    public JSArray getAllModules() {
        JSArray arr = new JSArray();
        SQLiteDatabase db = getReadableDatabase();
        String sql = "SELECT id, path, file_name, format, type, is_sqlite, title, abbr, lang, " +
                     "description, size_bytes, has_strong, has_morph, rtl, locked, tables_csv, " +
                     "coverage_ready, favorite FROM modules ORDER BY favorite DESC, title COLLATE NOCASE ASC";
        try (Cursor c = db.rawQuery(sql, null)) {
            while (c.moveToNext()) {
                JSObject o = new JSObject();
                o.put("id", c.getString(0));
                o.put("path", c.getString(1));
                o.put("fileName", c.getString(2));
                o.put("format", c.getString(3));
                o.put("type", c.getString(4));
                o.put("isSqlite", c.getInt(5) == 1);
                o.put("title", c.getString(6));
                o.put("abbr", c.getString(7));
                o.put("lang", c.getString(8));
                o.put("description", c.getString(9));
                o.put("sizeBytes", c.getLong(10));
                o.put("hasStrong", c.getInt(11) == 1);
                o.put("hasMorph", c.getInt(12) == 1);
                o.put("rtl", c.getInt(13) == 1);
                o.put("locked", c.getInt(14) == 1);
                o.put("tablesCsv", c.getString(15));
                o.put("coverageReady", c.getInt(16) == 1);
                o.put("favorite", c.getInt(17) == 1);
                arr.put(o);
            }
        }
        return arr;
    }

    public void setFavorite(String moduleId, boolean favorite) {
        ContentValues cv = new ContentValues();
        cv.put("favorite", favorite ? 1 : 0);
        getWritableDatabase().update("modules", cv, "id = ?", new String[]{moduleId});
    }

    public void replaceModuleCoverage(String moduleId, List<Integer> bookIds) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.delete("coverage_map", "module_id = ?", new String[]{moduleId});
            ContentValues cv = new ContentValues();
            for (Integer bookId : bookIds) {
                cv.clear();
                cv.put("module_id", moduleId);
                cv.put("book_id", bookId);
                db.insertWithOnConflict("coverage_map", null, cv, SQLiteDatabase.CONFLICT_IGNORE);
            }
            ContentValues flag = new ContentValues();
            flag.put("coverage_ready", 1);
            db.update("modules", flag, "id = ?", new String[]{moduleId});
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    public JSArray getModulesForBook(int bookId, String typeFilter) {
        JSArray arr = new JSArray();
        SQLiteDatabase db = getReadableDatabase();
        String sql = "SELECT m.id, m.title, m.abbr, m.type, m.format, m.path " +
                     "FROM coverage_map cm JOIN modules m ON m.id = cm.module_id " +
                     "WHERE cm.book_id = ?" +
                     (typeFilter != null && !typeFilter.isEmpty() ? " AND m.type = ?" : "") +
                     " ORDER BY m.favorite DESC, m.title COLLATE NOCASE ASC";
        String[] args = (typeFilter != null && !typeFilter.isEmpty())
            ? new String[]{String.valueOf(bookId), typeFilter}
            : new String[]{String.valueOf(bookId)};
        try (Cursor c = db.rawQuery(sql, args)) {
            while (c.moveToNext()) {
                JSObject o = new JSObject();
                o.put("id", c.getString(0));
                o.put("title", c.getString(1));
                o.put("abbr", c.getString(2));
                o.put("type", c.getString(3));
                o.put("format", c.getString(4));
                o.put("path", c.getString(5));
                arr.put(o);
            }
        }
        return arr;
    }

    public JSArray getModuleSets() {
        JSArray arr = new JSArray();
        SQLiteDatabase db = getReadableDatabase();
        try (Cursor c = db.rawQuery(
                "SELECT id, name, module_ids_json, sort_order, updated_at FROM module_sets ORDER BY sort_order ASC, name ASC", null)) {
            while (c.moveToNext()) {
                JSObject o = new JSObject();
                o.put("id", c.getString(0));
                o.put("name", c.getString(1));
                o.put("moduleIdsJson", c.getString(2));
                o.put("sortOrder", c.getInt(3));
                o.put("updatedAt", c.getLong(4));
                arr.put(o);
            }
        }
        return arr;
    }

    public void saveModuleSet(String id, String name, String moduleIdsJson, int sortOrder) {
        ContentValues cv = new ContentValues();
        cv.put("id", id);
        cv.put("name", name);
        cv.put("module_ids_json", moduleIdsJson);
        cv.put("sort_order", sortOrder);
        cv.put("updated_at", System.currentTimeMillis());
        getWritableDatabase().insertWithOnConflict("module_sets", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
    }

    public void deleteModuleSet(String id) {
        getWritableDatabase().delete("module_sets", "id = ?", new String[]{id});
    }
}
