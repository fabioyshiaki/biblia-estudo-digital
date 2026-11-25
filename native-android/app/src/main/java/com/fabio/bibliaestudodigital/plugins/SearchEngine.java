package com.fabio.bibliaestudodigital.plugins;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.database.sqlite.SQLiteStatement;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

public class SearchEngine extends SQLiteOpenHelper {

    private static final String DB_NAME = "search_index.db";
    private static final int DB_VERSION = 1;

    private static final int[] MYBIBLE_BOOK_NUMS = {
        10,20,30,40,50,60,70,80,90,100,110,120,130,140,150,160,190,220,230,240,
        250,260,290,300,310,330,340,350,360,370,380,390,400,410,420,430,440,450,460,
        470,480,490,500,510,520,530,540,550,560,570,580,590,600,610,620,630,640,650,
        660,670,680,690,700,710,720,730
    };

    public SearchEngine(Context context) {
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
            "CREATE TABLE IF NOT EXISTS indexed_modules (" +
            "  module_id TEXT PRIMARY KEY," +
            "  title TEXT NOT NULL," +
            "  abbr TEXT NOT NULL," +
            "  verse_count INTEGER NOT NULL," +
            "  indexed_at INTEGER NOT NULL" +
            ")"
        );
        db.execSQL(
            "CREATE VIRTUAL TABLE IF NOT EXISTS verses_fts USING fts4(" +
            "  module_id," +
            "  book_id," +
            "  chapter," +
            "  verse," +
            "  plain_text," +
            "  tokenize=unicode61" +
            ")"
        );
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {}

    public JSObject getStats() {
        JSArray list = new JSArray();
        long totalVerses = 0;
        SQLiteDatabase db = getReadableDatabase();
        String sql = "SELECT module_id, title, abbr, verse_count, indexed_at FROM indexed_modules ORDER BY indexed_at DESC";
        try (Cursor c = db.rawQuery(sql, null)) {
            while (c.moveToNext()) {
                JSObject o = new JSObject();
                o.put("moduleId", c.getString(0));
                o.put("title", c.getString(1));
                o.put("abbr", c.getString(2));
                int vc = c.getInt(3);
                totalVerses += vc;
                o.put("verseCount", vc);
                o.put("indexedAt", c.getLong(4));
                list.put(o);
            }
        }
        JSObject ret = new JSObject();
        ret.put("indexedModules", list);
        ret.put("totalVerses", totalVerses);
        return ret;
    }

    public JSObject indexBibleModule(CatalogDatabase catalogDb, String moduleId) throws Exception {
        long start = System.currentTimeMillis();
        JSONObject mod = findModuleById(catalogDb, moduleId);
        if (mod == null) throw new IllegalArgumentException("Módulo não encontrado: " + moduleId);
        if (!mod.optBoolean("isSqlite") || !"bible".equals(mod.optString("type"))) {
            throw new IllegalArgumentException("Apenas Bíblias SQLite podem ser indexadas no FTS4.");
        }

        String path = mod.optString("path");
        String format = mod.optString("format");
        boolean isMyBible = "mybible".equals(format);
        String selectSql = isMyBible
            ? "SELECT book_number, chapter, verse, text FROM verses"
            : "SELECT Book, Chapter, Verse, Scripture FROM Bible";

        SQLiteDatabase idxDb = getWritableDatabase();
        SQLiteDatabase srcDb = null;
        int inserted = 0;

        try {
            int flags = SQLiteDatabase.OPEN_READONLY | SQLiteDatabase.NO_LOCALIZED_COLLATORS;
            srcDb = SQLiteDatabase.openDatabase(path, null, flags);

            idxDb.beginTransaction();
            try {
                idxDb.delete("verses_fts", "module_id = ?", new String[]{moduleId});
                idxDb.delete("indexed_modules", "module_id = ?", new String[]{moduleId});

                SQLiteStatement stmt = idxDb.compileStatement(
                    "INSERT INTO verses_fts(module_id, book_id, chapter, verse, plain_text) VALUES(?,?,?,?,?)"
                );

                try (Cursor c = srcDb.rawQuery(selectSql, null)) {
                    while (c.moveToNext()) {
                        int rawBook = c.getInt(0);
                        int bookId = isMyBible ? mybibleBookToCanonical(rawBook) : rawBook;
                        if (bookId <= 0) continue;
                        int chapter = c.getInt(1);
                        int verse = c.getInt(2);
                        String raw = c.isNull(3) ? "" : c.getString(3);
                        String clean = stripMarkup(raw);
                        if (clean.isEmpty()) continue;

                        stmt.bindString(1, moduleId);
                        stmt.bindLong(2, bookId);
                        stmt.bindLong(3, chapter);
                        stmt.bindLong(4, verse);
                        stmt.bindString(5, clean);
                        stmt.executeInsert();
                        inserted++;
                    }
                }

                SQLiteStatement metaStmt = idxDb.compileStatement(
                    "INSERT OR REPLACE INTO indexed_modules(module_id, title, abbr, verse_count, indexed_at) VALUES(?,?,?,?,?)"
                );
                metaStmt.bindString(1, moduleId);
                metaStmt.bindString(2, mod.optString("title", mod.optString("fileName")));
                metaStmt.bindString(3, mod.optString("abbr", ""));
                metaStmt.bindLong(4, inserted);
                metaStmt.bindLong(5, System.currentTimeMillis());
                metaStmt.executeInsert();

                idxDb.setTransactionSuccessful();
            } finally {
                idxDb.endTransaction();
            }
        } finally {
            if (srcDb != null && srcDb.isOpen()) {
                try { srcDb.close(); } catch (Exception ignored) {}
            }
        }

        JSObject ret = new JSObject();
        ret.put("moduleId", moduleId);
        ret.put("verseCount", inserted);
        ret.put("durationMs", System.currentTimeMillis() - start);
        return ret;
    }

    public JSObject search(CatalogDatabase catalogDb, String query, JSArray moduleIds, int limit) {
        long start = System.currentTimeMillis();
        String q = query == null ? "" : query.trim();
        JSObject ret = new JSObject();
        JSArray results = new JSArray();
        int maxResults = Math.max(10, Math.min(250, limit > 0 ? limit : 80));

        if (q.length() < 2) {
            ret.put("results", results);
            ret.put("durationMs", 0);
            ret.put("usedFts", false);
            return ret;
        }

        Set<String> targetIds = new HashSet<>();
        if (moduleIds != null) {
            for (int i = 0; i < moduleIds.length(); i++) {
                String id = moduleIds.optString(i, "");
                if (!id.isEmpty()) targetIds.add(id);
            }
        }

        Set<String> indexedIds = getIndexedModuleIds();
        boolean isStrongQuery = q.matches("(?i)^[GH]\\d{1,5}$");
        boolean usedFts = false;

        // 1. Consulta ultrarrápida via FTS4 nos módulos já indexados (exceto buscas Strong literais)
        if (!isStrongQuery && !indexedIds.isEmpty()) {
            List<String> ftsTargets = new ArrayList<>();
            if (targetIds.isEmpty()) {
                ftsTargets.addAll(indexedIds);
            } else {
                for (String id : targetIds) {
                    if (indexedIds.contains(id)) ftsTargets.add(id);
                }
            }
            if (!ftsTargets.isEmpty()) {
                usedFts = true;
                queryFts(catalogDb, q, ftsTargets, maxResults, results);
            }
        }

        // 2. Fallback direto somente leitura nos módulos escolhidos ainda não indexados (ou busca Strong)
        if (results.length() < maxResults && !targetIds.isEmpty()) {
            JSArray all = catalogDb.getAllModules();
            for (int i = 0; i < all.length() && results.length() < maxResults; i++) {
                JSONObject mod = all.optJSONObject(i);
                if (mod == null) continue;
                String id = mod.optString("id");
                if (!targetIds.contains(id)) continue;
                if (!isStrongQuery && indexedIds.contains(id)) continue;
                if (!mod.optBoolean("isSqlite") || mod.optBoolean("locked")) continue;

                searchModuleDirect(mod, q, maxResults - results.length(), results);
            }
        }

        ret.put("results", results);
        ret.put("totalReturned", results.length());
        ret.put("durationMs", System.currentTimeMillis() - start);
        ret.put("usedFts", usedFts);
        return ret;
    }

    private void queryFts(CatalogDatabase catalogDb, String query, List<String> ids, int limit, JSArray out) {
        String ftsQuery = buildFtsMatchQuery(query);
        if (ftsQuery.isEmpty()) return;

        StringBuilder placeholders = new StringBuilder();
        List<String> args = new ArrayList<>();
        args.add(ftsQuery);
        for (int i = 0; i < ids.size(); i++) {
            if (i > 0) placeholders.append(',');
            placeholders.append('?');
            args.add(ids.get(i));
        }
        args.add(String.valueOf(limit));

        String sql =
            "SELECT module_id, book_id, chapter, verse, plain_text FROM verses_fts " +
            "WHERE verses_fts MATCH ? AND module_id IN (" + placeholders + ") LIMIT ?";

        try (Cursor c = getReadableDatabase().rawQuery(sql, args.toArray(new String[0]))) {
            while (c.moveToNext()) {
                String modId = c.getString(0);
                JSONObject mod = findModuleById(catalogDb, modId);
                JSObject row = new JSObject();
                row.put("moduleId", modId);
                row.put("moduleAbbr", mod != null ? mod.optString("abbr", "") : "");
                row.put("moduleTitle", mod != null ? mod.optString("title", "") : "");
                row.put("type", "bible");
                row.put("bookId", c.getInt(1));
                row.put("chapter", c.getInt(2));
                row.put("verse", c.getInt(3));
                row.put("snippet", buildSnippet(c.getString(4), query));
                out.put(row);
            }
        } catch (Exception ignored) {}
    }

    private void searchModuleDirect(JSONObject mod, String query, int remaining, JSArray out) {
        String path = mod.optString("path");
        String format = mod.optString("format");
        String type = mod.optString("type");
        String tables = "," + mod.optString("tablesCsv", "").toLowerCase(Locale.ROOT) + ",";
        boolean isMyBible = "mybible".equals(format);
        String like = "%" + query + "%";

        SQLiteDatabase db = null;
        try {
            int flags = SQLiteDatabase.OPEN_READONLY | SQLiteDatabase.NO_LOCALIZED_COLLATORS;
            db = SQLiteDatabase.openDatabase(path, null, flags);

            String sql = null;
            if ("bible".equals(type)) {
                if (isMyBible && tables.contains(",verses,")) {
                    sql = "SELECT book_number, chapter, verse, text FROM verses WHERE text LIKE ? COLLATE NOCASE LIMIT " + remaining;
                } else if (tables.contains(",bible,")) {
                    sql = "SELECT Book, Chapter, Verse, Scripture FROM Bible WHERE Scripture LIKE ? COLLATE NOCASE LIMIT " + remaining;
                }
            } else if ("commentary".equals(type)) {
                if (isMyBible && tables.contains(",commentaries,")) {
                    sql = "SELECT book_number, chapter_number_from, verse_number_from, text FROM commentaries WHERE text LIKE ? COLLATE NOCASE LIMIT " + remaining;
                } else if (tables.contains(",commentary,")) {
                    sql = "SELECT Book, Chapter, FromVerse, Data FROM Commentary WHERE Data LIKE ? COLLATE NOCASE LIMIT " + remaining;
                } else if (tables.contains(",verses,") && "esword".equals(format)) {
                    sql = "SELECT Book, Chapter, VerseBegin, Comments FROM Verses WHERE Comments LIKE ? COLLATE NOCASE LIMIT " + remaining;
                }
            }

            if (sql == null) return;

            try (Cursor c = db.rawQuery(sql, new String[]{like})) {
                while (c.moveToNext()) {
                    int rawBook = c.getInt(0);
                    int bookId = isMyBible ? mybibleBookToCanonical(rawBook) : rawBook;
                    if (bookId <= 0) continue;
                    JSObject row = new JSObject();
                    row.put("moduleId", mod.optString("id"));
                    row.put("moduleAbbr", mod.optString("abbr", ""));
                    row.put("moduleTitle", mod.optString("title", ""));
                    row.put("type", type);
                    row.put("bookId", bookId);
                    row.put("chapter", c.getInt(1));
                    row.put("verse", Math.max(1, c.getInt(2)));
                    row.put("snippet", buildSnippet(stripMarkup(c.isNull(3) ? "" : c.getString(3)), query));
                    out.put(row);
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (db != null && db.isOpen()) {
                try { db.close(); } catch (Exception ignored) {}
            }
        }
    }

    private Set<String> getIndexedModuleIds() {
        Set<String> set = new HashSet<>();
        try (Cursor c = getReadableDatabase().rawQuery("SELECT module_id FROM indexed_modules", null)) {
            while (c.moveToNext()) set.add(c.getString(0));
        } catch (Exception ignored) {}
        return set;
    }

    private JSONObject findModuleById(CatalogDatabase catalogDb, String id) {
        JSArray all = catalogDb.getAllModules();
        for (int i = 0; i < all.length(); i++) {
            JSONObject m = all.optJSONObject(i);
            if (m != null && id.equals(m.optString("id"))) return m;
        }
        return null;
    }

    private static String buildFtsMatchQuery(String raw) {
        String clean = raw.replaceAll("[^\\p{L}\\p{N}\\s\"]", " ").trim();
        if (clean.isEmpty()) return "";
        if (clean.startsWith("\"") && clean.endsWith("\"") && clean.length() > 2) return clean;
        String[] tokens = clean.split("\\s+");
        StringBuilder sb = new StringBuilder();
        for (String t : tokens) {
            if (t.length() < 2) continue;
            if (sb.length() > 0) sb.append(" AND ");
            sb.append(t).append('*');
        }
        return sb.toString();
    }

    private static String stripMarkup(String raw) {
        if (raw == null) return "";
        return raw.replaceAll("<[^>]+>", " ")
                  .replaceAll("\\{\\\\[^}]*\\}", " ")
                  .replaceAll("\\\\[a-zA-Z]+-?\\d*\\s?", " ")
                  .replaceAll("\\s+", " ")
                  .trim();
    }

    private static String buildSnippet(String text, String query) {
        if (text == null) return "";
        if (text.length() <= 190) return text;
        int idx = text.toLowerCase(Locale.ROOT).indexOf(query.toLowerCase(Locale.ROOT));
        if (idx < 0) return text.substring(0, 190) + "...";
        int start = Math.max(0, idx - 55);
        int end = Math.min(text.length(), idx + query.length() + 115);
        String prefix = start > 0 ? "..." : "";
        String suffix = end < text.length() ? "..." : "";
        return prefix + text.substring(start, end).trim() + suffix;
    }

    private static int mybibleBookToCanonical(int num) {
        for (int i = 0; i < MYBIBLE_BOOK_NUMS.length; i++) {
            if (MYBIBLE_BOOK_NUMS[i] == num) return i + 1;
        }
        return -1;
    }
}
