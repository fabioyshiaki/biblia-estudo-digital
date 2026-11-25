package com.fabio.bibliaestudodigital.plugins;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class UserDataDatabase extends SQLiteOpenHelper {

    private static final String DB_NAME = "user_data.db";
    private static final int DB_VERSION = 1;

    public UserDataDatabase(Context context) {
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
            "CREATE TABLE IF NOT EXISTS highlights (" +
            "  book_id INTEGER NOT NULL," +
            "  chapter INTEGER NOT NULL," +
            "  verse INTEGER NOT NULL," +
            "  color TEXT NOT NULL," +
            "  updated_at INTEGER NOT NULL," +
            "  PRIMARY KEY (book_id, chapter, verse)" +
            ")"
        );
        db.execSQL(
            "CREATE TABLE IF NOT EXISTS notes (" +
            "  id TEXT PRIMARY KEY," +
            "  book_id INTEGER NOT NULL," +
            "  chapter INTEGER NOT NULL," +
            "  verse_start INTEGER NOT NULL," +
            "  verse_end INTEGER NOT NULL," +
            "  title TEXT NOT NULL DEFAULT ''," +
            "  body TEXT NOT NULL," +
            "  tags_csv TEXT NOT NULL DEFAULT ''," +
            "  created_at INTEGER NOT NULL," +
            "  updated_at INTEGER NOT NULL" +
            ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_notes_ref ON notes(book_id, chapter)");
        db.execSQL(
            "CREATE TABLE IF NOT EXISTS bookmarks (" +
            "  id TEXT PRIMARY KEY," +
            "  book_id INTEGER NOT NULL," +
            "  chapter INTEGER NOT NULL," +
            "  verse INTEGER NOT NULL," +
            "  label TEXT NOT NULL DEFAULT ''," +
            "  created_at INTEGER NOT NULL" +
            ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_bookmarks_ref ON bookmarks(book_id, chapter)");
        db.execSQL(
            "CREATE TABLE IF NOT EXISTS clippings (" +
            "  id TEXT PRIMARY KEY," +
            "  book_id INTEGER NOT NULL," +
            "  chapter INTEGER NOT NULL," +
            "  verse INTEGER NOT NULL," +
            "  source_title TEXT NOT NULL DEFAULT ''," +
            "  excerpt TEXT NOT NULL," +
            "  comment TEXT NOT NULL DEFAULT ''," +
            "  created_at INTEGER NOT NULL" +
            ")"
        );
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_clippings_ref ON clippings(book_id, chapter)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {}

    public JSObject dispatch(String action, JSObject p) throws Exception {
        switch (action) {
            case "getChapterHighlights":
                return wrap("highlights", getChapterHighlights(p.optInt("bookId", 0), p.optInt("chapter", 0)));
            case "setHighlight":
                return setHighlight(
                    p.optInt("bookId", 0),
                    p.optInt("chapter", 0),
                    p.optInt("verse", 0),
                    p.optString("color", "")
                );
            case "getNotes":
                return wrap("notes", getNotes(
                    p.optInt("bookId", 0),
                    p.optInt("chapter", 0),
                    p.optString("query", "")
                ));
            case "saveNote":
                return saveNote(p);
            case "deleteNote":
                return deleteById("notes", p.optString("id", ""));
            case "getBookmarks":
                return wrap("bookmarks", getBookmarks());
            case "saveBookmark":
                return saveBookmark(p);
            case "deleteBookmark":
                return deleteById("bookmarks", p.optString("id", ""));
            case "getClippings":
                return wrap("clippings", getClippings(p.optInt("bookId", 0), p.optInt("chapter", 0)));
            case "saveClipping":
                return saveClipping(p);
            case "deleteClipping":
                return deleteById("clippings", p.optString("id", ""));
            case "getCounts":
                return getCounts();
            case "exportBackup":
                return UserDataBackup.exportBackup(this, p);
            case "importBackup":
                return UserDataBackup.importBackup(this, p);
            default:
                throw new IllegalArgumentException("Ação desconhecida: " + action);
        }
    }

    private JSObject wrap(String key, JSArray arr) {
        JSObject o = new JSObject();
        o.put(key, arr);
        return o;
    }

    public JSArray getAllHighlights() {
        JSArray arr = new JSArray();
        SQLiteDatabase db = getReadableDatabase();
        String sql = "SELECT book_id, chapter, verse, color, updated_at FROM highlights ORDER BY book_id, chapter, verse";
        try (Cursor c = db.rawQuery(sql, null)) {
            while (c.moveToNext()) {
                JSObject o = new JSObject();
                o.put("bookId", c.getInt(0));
                o.put("chapter", c.getInt(1));
                o.put("verse", c.getInt(2));
                o.put("color", c.getString(3));
                o.put("updatedAt", c.getLong(4));
                arr.put(o);
            }
        }
        return arr;
    }

    public JSArray getChapterHighlights(int bookId, int chapter) {
        JSArray arr = new JSArray();
        SQLiteDatabase db = getReadableDatabase();
        String sql = "SELECT verse, color, updated_at FROM highlights WHERE book_id = ? AND chapter = ? ORDER BY verse ASC";
        try (Cursor c = db.rawQuery(sql, new String[]{String.valueOf(bookId), String.valueOf(chapter)})) {
            while (c.moveToNext()) {
                JSObject o = new JSObject();
                o.put("verse", c.getInt(0));
                o.put("color", c.getString(1));
                o.put("updatedAt", c.getLong(2));
                arr.put(o);
            }
        }
        return arr;
    }

    private JSObject setHighlight(int bookId, int chapter, int verse, String color) {
        SQLiteDatabase db = getWritableDatabase();
        String clean = color == null ? "" : color.trim();
        if (clean.isEmpty() || "none".equalsIgnoreCase(clean)) {
            db.delete("highlights", "book_id = ? AND chapter = ? AND verse = ?",
                new String[]{String.valueOf(bookId), String.valueOf(chapter), String.valueOf(verse)});
        } else {
            ContentValues cv = new ContentValues();
            cv.put("book_id", bookId);
            cv.put("chapter", chapter);
            cv.put("verse", verse);
            cv.put("color", clean);
            cv.put("updated_at", System.currentTimeMillis());
            db.insertWithOnConflict("highlights", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
        }
        JSObject ret = new JSObject();
        ret.put("ok", true);
        return ret;
    }

    public JSArray getNotes(int bookId, int chapter, String query) {
        JSArray arr = new JSArray();
        SQLiteDatabase db = getReadableDatabase();
        StringBuilder sql = new StringBuilder(
            "SELECT id, book_id, chapter, verse_start, verse_end, title, body, tags_csv, created_at, updated_at FROM notes WHERE 1=1"
        );
        List<String> args = new ArrayList<>();
        if (bookId > 0) {
            sql.append(" AND book_id = ?");
            args.add(String.valueOf(bookId));
        }
        if (chapter > 0) {
            sql.append(" AND chapter = ?");
            args.add(String.valueOf(chapter));
        }
        String q = query == null ? "" : query.trim();
        if (!q.isEmpty()) {
            sql.append(" AND (title LIKE ? COLLATE NOCASE OR body LIKE ? COLLATE NOCASE OR tags_csv LIKE ? COLLATE NOCASE)");
            String like = "%" + q + "%";
            args.add(like);
            args.add(like);
            args.add(like);
        }
        sql.append(" ORDER BY updated_at DESC LIMIT 300");

        try (Cursor c = db.rawQuery(sql.toString(), args.toArray(new String[0]))) {
            while (c.moveToNext()) {
                JSObject o = new JSObject();
                o.put("id", c.getString(0));
                o.put("bookId", c.getInt(1));
                o.put("chapter", c.getInt(2));
                o.put("verseStart", c.getInt(3));
                o.put("verseEnd", c.getInt(4));
                o.put("title", c.getString(5));
                o.put("body", c.getString(6));
                o.put("tagsCsv", c.getString(7));
                o.put("createdAt", c.getLong(8));
                o.put("updatedAt", c.getLong(9));
                arr.put(o);
            }
        }
        return arr;
    }

    private JSObject saveNote(JSObject p) {
        long now = System.currentTimeMillis();
        String id = p.optString("id", "").trim();
        if (id.isEmpty()) id = "note_" + UUID.randomUUID().toString().substring(0, 12);
        int verseStart = p.optInt("verseStart", 1);
        int verseEnd = Math.max(verseStart, p.optInt("verseEnd", verseStart));

        ContentValues cv = new ContentValues();
        cv.put("id", id);
        cv.put("book_id", p.optInt("bookId", 1));
        cv.put("chapter", p.optInt("chapter", 1));
        cv.put("verse_start", verseStart);
        cv.put("verse_end", verseEnd);
        cv.put("title", p.optString("title", "").trim());
        cv.put("body", p.optString("body", "").trim());
        cv.put("tags_csv", p.optString("tagsCsv", "").trim());
        cv.put("created_at", p.optLong("createdAt", now));
        cv.put("updated_at", now);

        getWritableDatabase().insertWithOnConflict("notes", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
        JSObject ret = new JSObject();
        ret.put("id", id);
        ret.put("updatedAt", now);
        return ret;
    }

    public JSArray getBookmarks() {
        JSArray arr = new JSArray();
        SQLiteDatabase db = getReadableDatabase();
        String sql = "SELECT id, book_id, chapter, verse, label, created_at FROM bookmarks ORDER BY created_at DESC LIMIT 200";
        try (Cursor c = db.rawQuery(sql, null)) {
            while (c.moveToNext()) {
                JSObject o = new JSObject();
                o.put("id", c.getString(0));
                o.put("bookId", c.getInt(1));
                o.put("chapter", c.getInt(2));
                o.put("verse", c.getInt(3));
                o.put("label", c.getString(4));
                o.put("createdAt", c.getLong(5));
                arr.put(o);
            }
        }
        return arr;
    }

    private JSObject saveBookmark(JSObject p) {
        long now = System.currentTimeMillis();
        String id = p.optString("id", "").trim();
        if (id.isEmpty()) id = "bm_" + UUID.randomUUID().toString().substring(0, 12);

        ContentValues cv = new ContentValues();
        cv.put("id", id);
        cv.put("book_id", p.optInt("bookId", 1));
        cv.put("chapter", p.optInt("chapter", 1));
        cv.put("verse", p.optInt("verse", 1));
        cv.put("label", p.optString("label", "").trim());
        cv.put("created_at", p.optLong("createdAt", now));

        getWritableDatabase().insertWithOnConflict("bookmarks", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
        JSObject ret = new JSObject();
        ret.put("id", id);
        return ret;
    }

    public JSArray getClippings(int bookId, int chapter) {
        JSArray arr = new JSArray();
        SQLiteDatabase db = getReadableDatabase();
        StringBuilder sql = new StringBuilder(
            "SELECT id, book_id, chapter, verse, source_title, excerpt, comment, created_at FROM clippings WHERE 1=1"
        );
        List<String> args = new ArrayList<>();
        if (bookId > 0) {
            sql.append(" AND book_id = ?");
            args.add(String.valueOf(bookId));
        }
        if (chapter > 0) {
            sql.append(" AND chapter = ?");
            args.add(String.valueOf(chapter));
        }
        sql.append(" ORDER BY created_at DESC LIMIT 200");

        try (Cursor c = db.rawQuery(sql.toString(), args.toArray(new String[0]))) {
            while (c.moveToNext()) {
                JSObject o = new JSObject();
                o.put("id", c.getString(0));
                o.put("bookId", c.getInt(1));
                o.put("chapter", c.getInt(2));
                o.put("verse", c.getInt(3));
                o.put("sourceTitle", c.getString(4));
                o.put("excerpt", c.getString(5));
                o.put("comment", c.getString(6));
                o.put("createdAt", c.getLong(7));
                arr.put(o);
            }
        }
        return arr;
    }

    private JSObject saveClipping(JSObject p) {
        long now = System.currentTimeMillis();
        String id = p.optString("id", "").trim();
        if (id.isEmpty()) id = "clip_" + UUID.randomUUID().toString().substring(0, 12);

        ContentValues cv = new ContentValues();
        cv.put("id", id);
        cv.put("book_id", p.optInt("bookId", 1));
        cv.put("chapter", p.optInt("chapter", 1));
        cv.put("verse", p.optInt("verse", 1));
        cv.put("source_title", p.optString("sourceTitle", "").trim());
        cv.put("excerpt", p.optString("excerpt", "").trim());
        cv.put("comment", p.optString("comment", "").trim());
        cv.put("created_at", p.optLong("createdAt", now));

        getWritableDatabase().insertWithOnConflict("clippings", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
        JSObject ret = new JSObject();
        ret.put("id", id);
        return ret;
    }

    private JSObject deleteById(String table, String id) {
        getWritableDatabase().delete(table, "id = ?", new String[]{id});
        JSObject ret = new JSObject();
        ret.put("ok", true);
        return ret;
    }

    public JSObject getCounts() {
        JSObject ret = new JSObject();
        ret.put("highlights", countTable("highlights"));
        ret.put("notes", countTable("notes"));
        ret.put("bookmarks", countTable("bookmarks"));
        ret.put("clippings", countTable("clippings"));
        return ret;
    }

    private long countTable(String table) {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT COUNT(*) FROM " + table, null)) {
            return c.moveToFirst() ? c.getLong(0) : 0L;
        }
    }
}
