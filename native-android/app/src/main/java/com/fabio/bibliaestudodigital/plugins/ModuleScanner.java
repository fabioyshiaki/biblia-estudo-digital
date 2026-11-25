package com.fabio.bibliaestudodigital.plugins;

import android.content.Context;
import android.os.Build;
import android.os.Environment;
import android.os.storage.StorageManager;
import android.os.storage.StorageVolume;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.io.File;
import java.util.Locale;

public final class ModuleScanner {

    private ModuleScanner() {}

    public static JSArray getStorageVolumes(Context context) {
        JSArray volumes = new JSArray();
        StorageManager sm = (StorageManager) context.getSystemService(Context.STORAGE_SERVICE);

        if (sm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            for (StorageVolume vol : sm.getStorageVolumes()) {
                File dir = vol.getDirectory();
                if (dir != null && dir.exists()) {
                    JSObject item = new JSObject();
                    item.put("label", vol.getDescription(context));
                    item.put("path", dir.getAbsolutePath());
                    item.put("isRemovable", vol.isRemovable());
                    item.put("isPrimary", vol.isPrimary());
                    volumes.put(item);
                }
            }
        }

        if (volumes.length() == 0) {
            File primary = Environment.getExternalStorageDirectory();
            JSObject item = new JSObject();
            item.put("label", "Armazenamento Interno");
            item.put("path", primary.getAbsolutePath());
            item.put("isRemovable", false);
            item.put("isPrimary", true);
            volumes.put(item);
        }
        return volumes;
    }

    public static void scanRecursive(File dir, JSArray results) {
        File[] children = dir.listFiles();
        if (children == null) return;

        for (File f : children) {
            if (f.getName().startsWith(".")) continue;
            if (f.isDirectory()) {
                scanRecursive(f, results);
            } else if (f.isFile()) {
                String[] meta = classifyFile(f.getName().toLowerCase(Locale.ROOT));
                if (meta != null) {
                    JSObject item = new JSObject();
                    item.put("name", f.getName());
                    item.put("path", f.getAbsolutePath());
                    item.put("format", meta[0]);
                    item.put("type", meta[1]);
                    item.put("isSqlite", "1".equals(meta[2]));
                    item.put("sizeBytes", f.length());
                    item.put("lastModified", f.lastModified());
                    results.put(item);
                }
            }
        }
    }

    private static String[] classifyFile(String lower) {
        // Retorna { formato, tipo, isSqlite ("1" ou "0") }
        if (lower.endsWith(".bbl.mybible")) return new String[]{"mysword", "bible", "1"};
        if (lower.endsWith(".cmt.mybible")) return new String[]{"mysword", "commentary", "1"};
        if (lower.endsWith(".dct.mybible")) return new String[]{"mysword", "dictionary", "1"};
        if (lower.endsWith(".bok.mybible")) return new String[]{"mysword", "book", "1"};
        if (lower.endsWith(".dev.mybible")) return new String[]{"mysword", "devotional", "1"};
        if (lower.endsWith(".map.mybible")) return new String[]{"mysword", "map", "1"};

        if (lower.endsWith(".sqlite3")) {
            if (lower.contains(".commentaries.")) return new String[]{"mybible", "commentary", "1"};
            if (lower.contains(".dictionary.")) return new String[]{"mybible", "dictionary", "1"};
            if (lower.contains(".crossreferences.") || lower.contains(".subheadings.")) {
                return new String[]{"mybible", "reference", "1"};
            }
            return new String[]{"mybible", "bible", "1"};
        }

        if (lower.endsWith(".bbli") || lower.endsWith(".bblx")) return new String[]{"esword", "bible", "1"};
        if (lower.endsWith(".cmti") || lower.endsWith(".cmtx")) return new String[]{"esword", "commentary", "1"};
        if (lower.endsWith(".dcti") || lower.endsWith(".dctx")) return new String[]{"esword", "dictionary", "1"};
        if (lower.endsWith(".refi") || lower.endsWith(".topx")) return new String[]{"esword", "book", "1"};

        if (lower.endsWith(".ont") || lower.endsWith(".nt") || lower.endsWith(".ot")) {
            return new String[]{"theword", "bible", "0"};
        }
        if (lower.endsWith(".cmt.twm")) return new String[]{"theword", "commentary", "1"};
        if (lower.endsWith(".dct.twm")) return new String[]{"theword", "dictionary", "1"};
        if (lower.endsWith(".map.twm")) return new String[]{"theword", "map", "1"};
        if (lower.endsWith(".gbk.twm") || lower.endsWith(".twm")) return new String[]{"theword", "book", "1"};

        if (lower.endsWith(".epub")) return new String[]{"epub", "book", "0"};
        if (lower.endsWith(".pdf")) return new String[]{"pdf", "document", "0"};

        return null;
    }
}
