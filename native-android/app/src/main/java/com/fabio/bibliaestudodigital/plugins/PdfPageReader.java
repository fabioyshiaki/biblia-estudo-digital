package com.fabio.bibliaestudodigital.plugins;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.os.ParcelFileDescriptor;
import android.util.Base64;
import com.getcapacitor.JSObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;

public final class PdfPageReader {

    private static final int MIN_WIDTH = 600;
    private static final int MAX_WIDTH = 2048;

    private PdfPageReader() {}

    public static JSObject getInfo(String path) throws IOException {
        long start = System.currentTimeMillis();
        File file = requireFile(path);

        try (ParcelFileDescriptor pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
             PdfRenderer renderer = new PdfRenderer(pfd)) {
            JSObject ret = new JSObject();
            ret.put("pageCount", renderer.getPageCount());
            ret.put("queryMs", System.currentTimeMillis() - start);
            return ret;
        }
    }

    public static JSObject renderPage(String path, int pageIndex, int requestedWidth) throws IOException {
        long start = System.currentTimeMillis();
        File file = requireFile(path);
        int targetWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, requestedWidth > 0 ? requestedWidth : 1400));

        try (ParcelFileDescriptor pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
             PdfRenderer renderer = new PdfRenderer(pfd)) {

            int pageCount = renderer.getPageCount();
            if (pageCount <= 0) {
                throw new IOException("PDF sem páginas legíveis.");
            }
            int safeIndex = Math.max(0, Math.min(pageIndex, pageCount - 1));

            try (PdfRenderer.Page page = renderer.openPage(safeIndex)) {
                int srcW = Math.max(1, page.getWidth());
                int srcH = Math.max(1, page.getHeight());
                float scale = (float) targetWidth / (float) srcW;
                int bmpW = Math.max(1, Math.round(srcW * scale));
                int bmpH = Math.max(1, Math.round(srcH * scale));

                Bitmap bitmap = Bitmap.createBitmap(bmpW, bmpH, Bitmap.Config.ARGB_8888);
                try {
                    Canvas canvas = new Canvas(bitmap);
                    canvas.drawColor(Color.WHITE);
                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);

                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 88, baos);
                    String b64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);

                    JSObject ret = new JSObject();
                    ret.put("pageIndex", safeIndex);
                    ret.put("pageCount", pageCount);
                    ret.put("width", bmpW);
                    ret.put("height", bmpH);
                    ret.put("dataUrl", "data:image/jpeg;base64," + b64);
                    ret.put("queryMs", System.currentTimeMillis() - start);
                    return ret;
                } finally {
                    bitmap.recycle();
                }
            }
        }
    }

    private static File requireFile(String path) throws IOException {
        File file = new File(path);
        if (!file.exists() || !file.isFile()) {
            throw new IOException("Arquivo PDF não encontrado: " + path);
        }
        return file;
    }
}
