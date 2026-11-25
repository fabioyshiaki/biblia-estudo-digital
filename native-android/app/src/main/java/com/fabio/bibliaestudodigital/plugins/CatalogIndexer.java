package com.fabio.bibliaestudodigital.plugins;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.io.File;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

public final class CatalogIndexer {

    private static final int[] MYBIBLE_BOOK_NUMS = {
        10,20,30,40,50,60,70,80,90,100,110,120,130,140,150,160,190,220,230,240,
        250,260,290,300,310,330,340,350,360,370,380,390,400,410,420,430,440,450,460,
        470,480,490,500,510,520,530,540,550,560,570,580,590,600,610,620,630,640,650,
        660,670,680,690,700,710,720,730
    };

    private CatalogIndexer() {}

    public static JSObject syncFolders(CatalogDatabase catalogDb, List<String> folders, boolean forceReindex) {
        long start = System.currentTimeMillis();
        Map<String, long[]> cached = catalogDb.getCachedFingerprints();
        List<ContentValues> upserts = new ArrayList<>();
        List<String> activePaths = new ArrayList<>();
        Set<String> seenPaths = new HashSet<>();
        int inspected = 0;
        int skipped = 0;

        for (String folderPath : folders) {
            File dir = new File(folderPath);
            if (!dir.exists() || !dir.isDirectory()) continue;
            JSArray found = new JSArray();
            ModuleScanner.scanRecursive(dir, found);

            for (int i = 0; i < found.length(); i++) {
                org.json.JSONObject f = found.optJSONObject(i);
                if (f == null) continue;
                String path = f.optString("path", "");
                if (path.isEmpty() || !seenPaths.add(path)) continue;
                activePaths.add(path);

                long size = f.optLong("sizeBytes", 0);
                long mod = f.optLong("lastModified", 0);
                long[] prev = cached.get(path);

                if (!forceReindex && prev != null && prev[0] == size && prev[1] == mod) {
                    skipped++;
                    continue;
                }

                long fav = prev != null ? prev[2] : 0;
                long cov = prev != null ? prev[3] : 0;
                upserts.add(inspectSingleFile(f, fav, cov));
                inspected++;
            }
        }

        catalogDb.upsertModulesBatch(upserts, activePaths);

        JSObject res = new JSObject();
        res.put("totalModules", activePaths.size());
        res.put("inspected", inspected);
        res.put("cachedSkipped", skipped);
        res.put("durationMs", System.currentTimeMillis() - start);
        return res;
    }

    private static ContentValues inspectSingleFile(org.json.JSONObject f, long favorite, long coverageReady) {
        String path = f.optString("path");
        String fileName = f.optString("name");
        String format = f.optString("format");
        String type = f.optString("type");
        boolean isSqlite = f.optBoolean("isSqlite", false);

        String fallbackTitle = stripKnownExtensions(fileName);
        String title = fallbackTitle;
        String abbr = makeShortAbbr(fallbackTitle);
        String lang = "";
        String desc = "";
        int hasStrong = 0;
        int hasMorph = 0;
        int rtl = 0;
        int locked = 0;
        String tablesCsv = "";

        if (isSqlite) {
            SQLiteDatabase db = null;
            try {
                int flags = SQLiteDatabase.OPEN_READONLY | SQLiteDatabase.NO_LOCALIZED_COLLATORS;
                db = SQLiteDatabase.openDatabase(path, null, flags);
                List<String> tables = listTables(db);
                tablesCsv = joinCsv(tables);
                String lowerTables = "," + tablesCsv.toLowerCase(Locale.ROOT) + ",";

                if (lowerTables.contains(",details,")) {
                    String[] m = readDetailsTable(db);
                    title = pickBestTitle(m[0], m[1], m[3], fallbackTitle);
                    if (!m[1].isEmpty()) abbr = cleanText(m[1]);
                    lang = normalizeLang(m[2]);
                    desc = cleanText(m[3]);
                    hasStrong = "1".equals(m[4]) ? 1 : 0;
                    rtl = "1".equals(m[5]) ? 1 : 0;
                    hasMorph = "1".equals(m[6]) ? 1 : 0;
                } else if (lowerTables.contains(",info,")) {
                    String[] m = readKeyValueTable(db, "info");
                    title = pickBestTitle(m[0], m[1], m[3], fallbackTitle);
                    if (!m[1].isEmpty()) abbr = cleanText(m[1]);
                    lang = normalizeLang(m[2]);
                    desc = cleanText(m[3]);
                    hasStrong = "1".equals(m[4]) ? 1 : 0;
                    rtl = "1".equals(m[5]) ? 1 : 0;
                } else if (lowerTables.contains(",config,")) {
                    String[] m = readKeyValueTable(db, "config");
                    title = pickBestTitle(m[0], m[1], m[3], fallbackTitle);
                    if (!m[1].isEmpty()) abbr = cleanText(m[1]);
                    lang = normalizeLang(m[2]);
                    desc = cleanText(m[3]);
                }

                // Amostragem ultrarrápida de 1 versículo para detectar Strong e Morfologia reais
                if ("bible".equals(type) && (hasStrong == 0 || hasMorph == 0)) {
                    String sample = sampleFirstVerse(db, lowerTables);
                    if (sample != null) {
                        if (sample.contains("<WG") || sample.contains("<WH") || sample.contains("<S>")) {
                            hasStrong = 1;
                        }
                        if (sample.contains("<WT") || sample.contains("<m>")) {
                            hasMorph = 1;
                        }
                    }
                }
                if ("dictionary".equals(type)) {
                    String lowerTitle = (title + " " + fileName).toLowerCase(Locale.ROOT);
                    if (lowerTitle.contains("strong") || lowerTitle.contains("bhs") || lowerTitle.contains("lex")) {
                        hasStrong = 1;
                    }
                }
            } catch (Exception e) {
                locked = 1;
                desc = "Bloqueado ou formato SQLite incompatível";
            } finally {
                if (db != null && db.isOpen()) {
                    try { db.close(); } catch (Exception ignored) {}
                }
            }
        }

        ContentValues cv = new ContentValues();
        cv.put("id", stableId(path));
        cv.put("path", path);
        cv.put("file_name", fileName);
        cv.put("format", format);
        cv.put("type", type);
        cv.put("is_sqlite", isSqlite ? 1 : 0);
        cv.put("title", title);
        cv.put("abbr", abbr);
        cv.put("lang", lang);
        cv.put("description", desc.length() > 400 ? desc.substring(0, 400) : desc);
        cv.put("size_bytes", f.optLong("sizeBytes", 0));
        cv.put("last_modified", f.optLong("lastModified", 0));
        cv.put("has_strong", hasStrong);
        cv.put("has_morph", hasMorph);
        cv.put("rtl", rtl);
        cv.put("locked", locked);
        cv.put("tables_csv", tablesCsv);
        cv.put("coverage_ready", coverageReady);
        cv.put("favorite", favorite);
        cv.put("updated_at", System.currentTimeMillis());
        return cv;
    }

    public static JSObject buildCoverageForPending(CatalogDatabase catalogDb) {
        long start = System.currentTimeMillis();
        JSArray all = catalogDb.getAllModules();
        int indexedCount = 0;

        for (int i = 0; i < all.length(); i++) {
            org.json.JSONObject m = all.optJSONObject(i);
            if (m == null) continue;
            if (!m.optBoolean("isSqlite") || m.optBoolean("locked") || m.optBoolean("coverageReady")) continue;

            String type = m.optString("type");
            if (!"commentary".equals(type) && !"bible".equals(type)) continue;

            List<Integer> books = extractCoveredBooks(
                m.optString("path"), m.optString("format"), type, m.optString("tablesCsv")
            );
            catalogDb.replaceModuleCoverage(m.optString("id"), books);
            indexedCount++;
        }

        JSObject res = new JSObject();
        res.put("indexedModules", indexedCount);
        res.put("durationMs", System.currentTimeMillis() - start);
        return res;
    }

    private static List<Integer> extractCoveredBooks(String path, String format, String type, String tablesCsv) {
        List<Integer> books = new ArrayList<>();
        String lower = "," + tablesCsv.toLowerCase(Locale.ROOT) + ",";
        String sql = null;
        boolean isMyBible = "mybible".equals(format);

        if (isMyBible) {
            if (lower.contains(",commentaries,")) sql = "SELECT DISTINCT book_number FROM commentaries";
            else if (lower.contains(",verses,")) sql = "SELECT DISTINCT book_number FROM verses";
        } else {
            if ("commentary".equals(type) && lower.contains(",commentary,")) {
                sql = "SELECT DISTINCT Book FROM Commentary";
            } else if ("bible".equals(type) && lower.contains(",bible,")) {
                sql = "SELECT DISTINCT Book FROM Bible";
            }
        }
        if (sql == null) return books;

        SQLiteDatabase db = null;
        try {
            int flags = SQLiteDatabase.OPEN_READONLY | SQLiteDatabase.NO_LOCALIZED_COLLATORS;
            db = SQLiteDatabase.openDatabase(path, null, flags);
            try (Cursor c = db.rawQuery(sql, null)) {
                while (c.moveToNext()) {
                    int raw = c.getInt(0);
                    int canonical = isMyBible ? mybibleBookToCanonical(raw) : raw;
                    if (canonical > 0) books.add(canonical);
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (db != null && db.isOpen()) {
                try { db.close(); } catch (Exception ignored) {}
            }
        }
        return books;
    }

    private static String sampleFirstVerse(SQLiteDatabase db, String lowerTables) {
        String sql = null;
        if (lowerTables.contains(",bible,")) sql = "SELECT Scripture FROM Bible LIMIT 1";
        else if (lowerTables.contains(",verses,")) sql = "SELECT text FROM verses LIMIT 1";
        if (sql == null) return null;
        try (Cursor c = db.rawQuery(sql, null)) {
            if (c.moveToFirst() && !c.isNull(0)) return c.getString(0);
        } catch (Exception ignored) {}
        return null;
    }

    private static String[] readDetailsTable(SQLiteDatabase db) {
        String[] out = {"", "", "", "", "0", "0", "0"};
        try (Cursor c = db.rawQuery("SELECT * FROM Details LIMIT 1", null)) {
            if (!c.moveToFirst()) return out;
            for (int i = 0; i < c.getColumnCount(); i++) {
                String col = c.getColumnName(i).toLowerCase(Locale.ROOT);
                String val = c.isNull(i) ? "" : c.getString(i).trim();
                if (col.equals("title")) out[0] = val;
                if (col.equals("abbreviation") || col.equals("abbr")) out[1] = val;
                if (col.equals("language") || col.equals("lang")) out[2] = val;
                if (col.equals("description") || (out[3].isEmpty() && (col.equals("information") || col.equals("comments")))) {
                    out[3] = val;
                }
                if (col.equals("strongs") || col.equals("strong")) {
                    if ("1".equals(val) || "true".equalsIgnoreCase(val)) out[4] = "1";
                }
                if (col.equals("righttoleft") || col.equals("rtl")) {
                    if ("1".equals(val) || "true".equalsIgnoreCase(val)) out[5] = "1";
                }
                if (col.equals("interlinear") || col.equals("morphology")) {
                    if ("1".equals(val) || "true".equalsIgnoreCase(val)) out[6] = "1";
                }
            }
        } catch (Exception ignored) {}
        return out;
    }

    private static String[] readKeyValueTable(SQLiteDatabase db, String table) {
        String[] out = {"", "", "", "", "0", "0"};
        try (Cursor c = db.rawQuery("SELECT name, value FROM " + table, null)) {
            while (c.moveToNext()) {
                String k = c.isNull(0) ? "" : c.getString(0).toLowerCase(Locale.ROOT);
                String v = c.isNull(1) ? "" : c.getString(1).trim();
                if (k.equals("title")) out[0] = v;
                if (k.equals("abbrev") || k.equals("abbreviation")) out[1] = v;
                if (k.equals("language") || k.equals("lang")) out[2] = v;
                if (k.equals("description") || (out[3].isEmpty() && (k.equals("detailed_info") || k.equals("about")))) {
                    out[3] = v;
                }
                if (k.equals("strong_numbers") && ("true".equalsIgnoreCase(v) || "1".equals(v))) out[4] = "1";
                if (k.equals("right_to_left") && ("true".equalsIgnoreCase(v) || "1".equals(v))) out[5] = "1";
            }
        } catch (Exception ignored) {}
        return out;
    }

    private static String pickBestTitle(String rawTitle, String rawAbbr, String rawDesc, String fallback) {
        String t = cleanText(rawTitle);
        String d = cleanText(rawDesc);
        String a = cleanText(rawAbbr);
        boolean badTitle = t.isEmpty() || t.startsWith("©") || t.toLowerCase(Locale.ROOT).startsWith("copyright");
        if (!badTitle) return t;
        if (!d.isEmpty() && !d.startsWith("©")) return d;
        if (!a.isEmpty()) return a;
        return fallback;
    }

    private static String cleanText(String s) {
        if (s == null) return "";
        return s.replaceAll("(?i)<br\\s*/?>", " · ")
                .replaceAll("<[^>]+>", " ")
                .replace("&nbsp;", " ")
                .replace("&amp;", "&")
                .replaceAll("\\s+", " ")
                .replaceAll("^(?:·\\s*)+", "")
                .trim();
    }

    private static String normalizeLang(String raw) {
        String s = cleanText(raw).toUpperCase(Locale.ROOT);
        if (s.isEmpty()) return "";
        if (s.startsWith("POR") || s.startsWith("POT") || s.equals("PT") || s.startsWith("PT-")) return "PT";
        if (s.startsWith("HEB") || s.equals("HE") || s.equals("IW")) return "HE";
        if (s.startsWith("GRC") || s.startsWith("GRE") || s.equals("EL") || s.equals("GR")) return "EL";
        if (s.startsWith("ENG") || s.equals("EN") || s.startsWith("ING")) return "EN";
        if (s.startsWith("SPA") || s.startsWith("ESP") || s.equals("ES")) return "ES";
        return s.length() > 12 ? s.substring(0, 12) : s;
    }

    private static List<String> listTables(SQLiteDatabase db) {
        List<String> list = new ArrayList<>();
        try (Cursor c = db.rawQuery("SELECT name FROM sqlite_master WHERE type='table'", null)) {
            while (c.moveToNext()) list.add(c.getString(0));
        }
        return list;
    }

    private static int mybibleBookToCanonical(int num) {
        for (int i = 0; i < MYBIBLE_BOOK_NUMS.length; i++) {
            if (MYBIBLE_BOOK_NUMS[i] == num) return i + 1;
        }
        return -1;
    }

    private static String stripKnownExtensions(String name) {
        return name.replaceAll("(?i)\\.(bbl|cmt|dct|bok|dev|map)\\.mybible$", "")
                   .replaceAll("(?i)\\.(commentaries|dictionary|crossreferences|subheadings)\\.sqlite3$", "")
                   .replaceAll("(?i)\\.(sqlite3|bbli|bblx|cmti|cmtx|dcti|dctx|refi|topx|cmt\\.twm|dct\\.twm|gbk\\.twm|map\\.twm|twm|ont|nt|ot|epub|pdf)$", "");
    }

    private static String makeShortAbbr(String title) {
        String clean = title.replaceAll("[^A-Za-z0-9À-ÿ]", "");
        return clean.length() <= 10 ? clean : clean.substring(0, 10);
    }

    private static String joinCsv(List<String> list) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < list.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append(list.get(i));
        }
        return sb.toString();
    }

    private static String stableId(String path) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] dig = md.digest(path.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 8; i++) sb.append(String.format("%02x", dig[i]));
            return sb.toString();
        } catch (Exception e) {
            return String.valueOf(path.hashCode());
        }
    }
}
