package com.fabio.bibliaestudodigital.plugins;

import android.util.Xml;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import org.xmlpull.v1.XmlPullParser;

public final class EpubReader {

    private static final int MAX_CACHE = 8;
    private static final int MAX_ENTRY_BYTES = 4 * 1024 * 1024;
    private static final Pattern BODY_PATTERN =
        Pattern.compile("<body[^>]*>([\\s\\S]*?)</body>", Pattern.CASE_INSENSITIVE);

    private static final class ChapterRef {
        final String href;
        final String title;
        ChapterRef(String href, String title) {
            this.href = href;
            this.title = title;
        }
    }

    private static final class EpubMeta {
        final String title;
        final List<ChapterRef> chapters;
        EpubMeta(String title, List<ChapterRef> chapters) {
            this.title = title;
            this.chapters = chapters;
        }
    }

    private static final Map<String, EpubMeta> META_CACHE =
        new LinkedHashMap<String, EpubMeta>(12, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, EpubMeta> eldest) {
                return size() > MAX_CACHE;
            }
        };

    private EpubReader() {}

    public static JSObject getInfo(String path) throws Exception {
        long start = System.currentTimeMillis();
        File file = requireFile(path);
        EpubMeta meta = getOrParseMeta(file);

        JSArray chapters = new JSArray();
        for (int i = 0; i < meta.chapters.size(); i++) {
            ChapterRef ref = meta.chapters.get(i);
            JSObject o = new JSObject();
            o.put("index", i);
            o.put("title", ref.title);
            o.put("href", ref.href);
            chapters.put(o);
        }

        JSObject ret = new JSObject();
        ret.put("title", meta.title);
        ret.put("chapterCount", meta.chapters.size());
        ret.put("chapters", chapters);
        ret.put("queryMs", System.currentTimeMillis() - start);
        return ret;
    }

    public static JSObject readChapter(String path, int chapterIndex) throws Exception {
        long start = System.currentTimeMillis();
        File file = requireFile(path);
        EpubMeta meta = getOrParseMeta(file);

        if (chapterIndex < 0 || chapterIndex >= meta.chapters.size()) {
            throw new IOException("Capítulo fora do intervalo: " + chapterIndex);
        }

        ChapterRef ref = meta.chapters.get(chapterIndex);
        String rawHtml;
        try (ZipFile zip = new ZipFile(file, ZipFile.OPEN_READ)) {
            rawHtml = readEntryText(zip, ref.href);
        }

        String body = rawHtml;
        Matcher m = BODY_PATTERN.matcher(rawHtml);
        if (m.find()) {
            body = m.group(1);
        }

        JSObject ret = new JSObject();
        ret.put("index", chapterIndex);
        ret.put("title", ref.title);
        ret.put("html", body != null ? body : "");
        ret.put("chapterCount", meta.chapters.size());
        ret.put("queryMs", System.currentTimeMillis() - start);
        return ret;
    }

    private static File requireFile(String path) throws IOException {
        File file = new File(path);
        if (!file.exists() || !file.isFile()) {
            throw new IOException("Arquivo EPUB não encontrado: " + path);
        }
        return file;
    }

    private static EpubMeta getOrParseMeta(File file) throws Exception {
        String key = file.getAbsolutePath() + "|" + file.length() + "|" + file.lastModified();
        synchronized (META_CACHE) {
            EpubMeta cached = META_CACHE.get(key);
            if (cached != null) return cached;
        }

        EpubMeta parsed = parseEpub(file);
        synchronized (META_CACHE) {
            META_CACHE.put(key, parsed);
        }
        return parsed;
    }

    private static EpubMeta parseEpub(File file) throws Exception {
        try (ZipFile zip = new ZipFile(file, ZipFile.OPEN_READ)) {
            String opfPath = findOpfPath(zip);
            if (opfPath == null || opfPath.isEmpty()) {
                throw new IOException("Arquivo OPF não localizado dentro do EPUB.");
            }

            String opfDir = getParentDir(opfPath);
            String bookTitle = file.getName().replaceAll("(?i)\\.epub$", "");
            Map<String, String> manifest = new HashMap<>();
            List<String> spineIds = new ArrayList<>();
            String ncxHref = null;

            ZipEntry opfEntry = findEntry(zip, opfPath);
            if (opfEntry == null) {
                throw new IOException("Entrada OPF ausente no ZIP: " + opfPath);
            }

            XmlPullParser parser = Xml.newPullParser();
            try (InputStream is = zip.getInputStream(opfEntry)) {
                parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, true);
                parser.setInput(is, "UTF-8");
                int event = parser.getEventType();
                while (event != XmlPullParser.END_DOCUMENT) {
                    if (event == XmlPullParser.START_TAG) {
                        String tag = parser.getName().toLowerCase(Locale.ROOT);
                        if ("title".equals(tag)) {
                            String txt = safeNextText(parser).trim();
                            if (!txt.isEmpty()) bookTitle = txt;
                        } else if ("item".equals(tag)) {
                            String id = parser.getAttributeValue(null, "id");
                            String href = parser.getAttributeValue(null, "href");
                            String media = parser.getAttributeValue(null, "media-type");
                            if (id != null && href != null) {
                                String resolved = resolvePath(opfDir, href);
                                manifest.put(id, resolved);
                                if ("application/x-dtbncx+xml".equalsIgnoreCase(media)) {
                                    ncxHref = resolved;
                                }
                            }
                        } else if ("itemref".equals(tag)) {
                            String idref = parser.getAttributeValue(null, "idref");
                            if (idref != null && !idref.isEmpty()) {
                                spineIds.add(idref);
                            }
                        }
                    }
                    event = parser.next();
                }
            }

            Map<String, String> tocTitles = ncxHref != null ? parseNcxTitles(zip, ncxHref) : new HashMap<>();
            List<ChapterRef> chapters = new ArrayList<>();
            int idx = 1;
            for (String idref : spineIds) {
                String href = manifest.get(idref);
                if (href == null) continue;
                String title = tocTitles.get(href);
                if (title == null || title.isEmpty()) {
                    title = "Capítulo " + idx;
                }
                chapters.add(new ChapterRef(href, title));
                idx++;
            }

            return new EpubMeta(bookTitle, chapters);
        }
    }

    private static String findOpfPath(ZipFile zip) throws Exception {
        ZipEntry entry = findEntry(zip, "META-INF/container.xml");
        if (entry == null) return null;
        XmlPullParser parser = Xml.newPullParser();
        try (InputStream is = zip.getInputStream(entry)) {
            parser.setInput(is, "UTF-8");
            int event = parser.getEventType();
            while (event != XmlPullParser.END_DOCUMENT) {
                if (event == XmlPullParser.START_TAG && "rootfile".equalsIgnoreCase(parser.getName())) {
                    String fullPath = parser.getAttributeValue(null, "full-path");
                    if (fullPath != null && !fullPath.isEmpty()) return fullPath;
                }
                event = parser.next();
            }
        }
        return null;
    }

    private static Map<String, String> parseNcxTitles(ZipFile zip, String ncxPath) {
        Map<String, String> titles = new HashMap<>();
        ZipEntry entry = findEntry(zip, ncxPath);
        if (entry == null) return titles;

        String ncxDir = getParentDir(ncxPath);
        try (InputStream is = zip.getInputStream(entry)) {
            XmlPullParser parser = Xml.newPullParser();
            parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, true);
            parser.setInput(is, "UTF-8");

            String currentLabel = null;
            int event = parser.getEventType();
            while (event != XmlPullParser.END_DOCUMENT) {
                if (event == XmlPullParser.START_TAG) {
                    String tag = parser.getName().toLowerCase(Locale.ROOT);
                    if ("text".equals(tag)) {
                        String t = safeNextText(parser).trim();
                        if (!t.isEmpty()) currentLabel = t;
                    } else if ("content".equals(tag) && currentLabel != null) {
                        String src = parser.getAttributeValue(null, "src");
                        if (src != null) {
                            String clean = resolvePath(ncxDir, stripFragment(src));
                            if (!titles.containsKey(clean)) {
                                titles.put(clean, currentLabel);
                            }
                        }
                        currentLabel = null;
                    }
                }
                event = parser.next();
            }
        } catch (Exception ignored) {}
        return titles;
    }

    private static String safeNextText(XmlPullParser parser) {
        try {
            return parser.nextText();
        } catch (Exception e) {
            return "";
        }
    }

    private static ZipEntry findEntry(ZipFile zip, String path) {
        ZipEntry entry = zip.getEntry(path);
        if (entry != null) return entry;
        try {
            String decoded = URLDecoder.decode(path, "UTF-8");
            return zip.getEntry(decoded);
        } catch (Exception e) {
            return null;
        }
    }

    private static String readEntryText(ZipFile zip, String href) throws IOException {
        ZipEntry entry = findEntry(zip, href);
        if (entry == null) {
            throw new IOException("Capítulo não encontrado no EPUB: " + href);
        }
        try (InputStream is = zip.getInputStream(entry);
             ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            byte[] buf = new byte[16384];
            int total = 0;
            int read;
            while ((read = is.read(buf)) != -1) {
                total += read;
                if (total > MAX_ENTRY_BYTES) break;
                baos.write(buf, 0, read);
            }
            return new String(baos.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private static String getParentDir(String path) {
        int slash = path.lastIndexOf('/');
        return slash >= 0 ? path.substring(0, slash + 1) : "";
    }

    private static String stripFragment(String href) {
        int hash = href.indexOf('#');
        return hash >= 0 ? href.substring(0, hash) : href;
    }

    private static String resolvePath(String baseDir, String rel) {
        String combined = rel.startsWith("/") ? rel.substring(1) : (baseDir + rel);
        String[] parts = combined.split("/");
        List<String> stack = new ArrayList<>();
        for (String p : parts) {
            if (p.isEmpty() || ".".equals(p)) continue;
            if ("..".equals(p)) {
                if (!stack.isEmpty()) stack.remove(stack.size() - 1);
            } else {
                stack.add(p);
            }
        }
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < stack.size(); i++) {
            if (i > 0) sb.append('/');
            sb.append(stack.get(i));
        }
        return sb.toString();
    }

    public static void clearCache() {
        synchronized (META_CACHE) {
            META_CACHE.clear();
        }
    }
}
