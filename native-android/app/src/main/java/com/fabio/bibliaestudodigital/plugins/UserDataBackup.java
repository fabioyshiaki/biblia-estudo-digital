package com.fabio.bibliaestudodigital.plugins;

import android.content.ContentValues;
import android.database.sqlite.SQLiteDatabase;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

public final class UserDataBackup {

    public static final String DEFAULT_BACKUP_PATH =
        "/storage/emulated/0/Documents/BibliaEstudoDigital/backup_estudos.json";

    private UserDataBackup() {}

    public static JSObject exportBackup(UserDataDatabase userDb, JSObject payload) throws Exception {
        JSArray highlights = userDb.getAllHighlights();
        JSArray notes = userDb.getNotes(0, 0, "");
        JSArray bookmarks = userDb.getBookmarks();
        JSArray clippings = userDb.getClippings(0, 0);

        JSObject bundle = new JSObject();
        bundle.put("schemaVersion", 1);
        bundle.put("exportedAt", System.currentTimeMillis());
        bundle.put("highlights", highlights);
        bundle.put("notes", notes);
        bundle.put("bookmarks", bookmarks);
        bundle.put("clippings", clippings);

        String jsonText = bundle.toString(2);
        String targetPath = payload.optString("filePath", DEFAULT_BACKUP_PATH).trim();
        if (targetPath.isEmpty()) targetPath = DEFAULT_BACKUP_PATH;

        boolean writeFile = payload.optBoolean("writeFile", true);
        if (writeFile) {
            validateSafeJsonPath(targetPath);
            writeUtf8File(new File(targetPath), jsonText);
        }

        JSObject counts = new JSObject();
        counts.put("highlights", highlights.length());
        counts.put("notes", notes.length());
        counts.put("bookmarks", bookmarks.length());
        counts.put("clippings", clippings.length());

        JSObject ret = new JSObject();
        ret.put("path", writeFile ? targetPath : "");
        ret.put("counts", counts);
        ret.put("json", payload.optBoolean("includeJson", false) ? jsonText : "");
        return ret;
    }

    public static JSObject importBackup(UserDataDatabase userDb, JSObject payload) throws Exception {
        String rawJson = payload.optString("json", "").trim();
        String sourcePath = payload.optString("filePath", DEFAULT_BACKUP_PATH).trim();
        if (rawJson.isEmpty()) {
            if (sourcePath.isEmpty()) sourcePath = DEFAULT_BACKUP_PATH;
            validateSafeJsonPath(sourcePath);
            rawJson = readUtf8File(new File(sourcePath));
        }

        JSONObject root = new JSONObject(rawJson);
        boolean replace = payload.optBoolean("replace", false);
        long now = System.currentTimeMillis();

        int hCount = 0;
        int nCount = 0;
        int bCount = 0;
        int cCount = 0;

        SQLiteDatabase db = userDb.getWritableDatabase();
        db.beginTransaction();
        try {
            if (replace) {
                db.delete("highlights", null, null);
                db.delete("notes", null, null);
                db.delete("bookmarks", null, null);
                db.delete("clippings", null, null);
            }

            JSONArray highlights = root.optJSONArray("highlights");
            if (highlights != null) {
                for (int i = 0; i < highlights.length(); i++) {
                    JSONObject o = highlights.optJSONObject(i);
                    if (o == null) continue;
                    ContentValues cv = new ContentValues();
                    cv.put("book_id", o.optInt("bookId", 1));
                    cv.put("chapter", o.optInt("chapter", 1));
                    cv.put("verse", o.optInt("verse", 1));
                    cv.put("color", o.optString("color", "amber"));
                    cv.put("updated_at", o.optLong("updatedAt", now));
                    db.insertWithOnConflict("highlights", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
                    hCount++;
                }
            }

            JSONArray notes = root.optJSONArray("notes");
            if (notes != null) {
                for (int i = 0; i < notes.length(); i++) {
                    JSONObject o = notes.optJSONObject(i);
                    if (o == null) continue;
                    String id = o.optString("id", "").trim();
                    if (id.isEmpty()) continue;
                    int vs = o.optInt("verseStart", 1);
                    ContentValues cv = new ContentValues();
                    cv.put("id", id);
                    cv.put("book_id", o.optInt("bookId", 1));
                    cv.put("chapter", o.optInt("chapter", 1));
                    cv.put("verse_start", vs);
                    cv.put("verse_end", Math.max(vs, o.optInt("verseEnd", vs)));
                    cv.put("title", o.optString("title", ""));
                    cv.put("body", o.optString("body", ""));
                    cv.put("tags_csv", o.optString("tagsCsv", ""));
                    cv.put("created_at", o.optLong("createdAt", now));
                    cv.put("updated_at", o.optLong("updatedAt", now));
                    db.insertWithOnConflict("notes", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
                    nCount++;
                }
            }

            JSONArray bookmarks = root.optJSONArray("bookmarks");
            if (bookmarks != null) {
                for (int i = 0; i < bookmarks.length(); i++) {
                    JSONObject o = bookmarks.optJSONObject(i);
                    if (o == null) continue;
                    String id = o.optString("id", "").trim();
                    if (id.isEmpty()) continue;
                    ContentValues cv = new ContentValues();
                    cv.put("id", id);
                    cv.put("book_id", o.optInt("bookId", 1));
                    cv.put("chapter", o.optInt("chapter", 1));
                    cv.put("verse", o.optInt("verse", 1));
                    cv.put("label", o.optString("label", ""));
                    cv.put("created_at", o.optLong("createdAt", now));
                    db.insertWithOnConflict("bookmarks", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
                    bCount++;
                }
            }

            JSONArray clippings = root.optJSONArray("clippings");
            if (clippings != null) {
                for (int i = 0; i < clippings.length(); i++) {
                    JSONObject o = clippings.optJSONObject(i);
                    if (o == null) continue;
                    String id = o.optString("id", "").trim();
                    if (id.isEmpty()) continue;
                    ContentValues cv = new ContentValues();
                    cv.put("id", id);
                    cv.put("book_id", o.optInt("bookId", 1));
                    cv.put("chapter", o.optInt("chapter", 1));
                    cv.put("verse", o.optInt("verse", 1));
                    cv.put("source_title", o.optString("sourceTitle", ""));
                    cv.put("excerpt", o.optString("excerpt", ""));
                    cv.put("comment", o.optString("comment", ""));
                    cv.put("created_at", o.optLong("createdAt", now));
                    db.insertWithOnConflict("clippings", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
                    cCount++;
                }
            }

            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }

        JSObject counts = new JSObject();
        counts.put("highlights", hCount);
        counts.put("notes", nCount);
        counts.put("bookmarks", bCount);
        counts.put("clippings", cCount);

        JSObject ret = new JSObject();
        ret.put("imported", counts);
        return ret;
    }

    private static void validateSafeJsonPath(String path) throws IOException {
        String lower = path.toLowerCase(Locale.ROOT);
        if (!lower.endsWith(".json")) {
            throw new IOException("O arquivo de backup precisa terminar em .json.");
        }
        if (lower.contains("/mysword") || lower.contains(".mybible") || lower.contains(".sqlite3") || lower.contains(".twm")) {
            throw new IOException("Caminho bloqueado por proteção aos módulos da biblioteca.");
        }
    }

    private static void writeUtf8File(File file, String content) throws IOException {
        File parent = file.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IOException("Não foi possível criar a pasta de backup: " + parent.getAbsolutePath());
        }
        try (FileOutputStream fos = new FileOutputStream(file, false)) {
            fos.write(content.getBytes(StandardCharsets.UTF_8));
            fos.flush();
        }
    }

    private static String readUtf8File(File file) throws IOException {
        if (!file.exists() || !file.isFile()) {
            throw new IOException("Arquivo de backup não encontrado: " + file.getAbsolutePath());
        }
        try (FileInputStream fis = new FileInputStream(file);
             ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            byte[] buf = new byte[16384];
            int read;
            while ((read = fis.read(buf)) != -1) {
                baos.write(buf, 0, read);
            }
            return new String(baos.toByteArray(), StandardCharsets.UTF_8);
        }
    }
}
