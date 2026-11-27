package io.github.arilcihuyy.snscanner;

import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

public class CoreTest {
    private static final String T1 = "2026-11-26T07:00:00.000Z";
    private static final String T2 = "2026-11-26T07:01:00.000Z";

    @Test
    public void cleanAndKeyIgnoreSpacesAndCase() {
        assertEquals("SN 001", SnUtil.clean("  SN   001 \u200B"));
        assertEquals("SN001", SnUtil.key(" sn 001 "));
        assertTrue(SnUtil.same("sn-001", "SN-001"));
        assertFalse(SnUtil.same("sn-001", "sn-002"));
    }

    @Test
    public void brandInferenceAndOverride() {
        assertEquals("ZTE", SnUtil.guessBrand("ZTEGC123"));
        assertEquals("Huawei", SnUtil.guessBrand("HWTC123"));
        assertEquals("Huawei", SnUtil.guessBrand("48575443ABCDEF"));
        assertEquals("FiberHome", SnUtil.guessBrand("FHTT123"));
        assertEquals("RCM", SnUtil.guessBrand("RCM123"));
        assertEquals("Lainnya", SnUtil.guessBrand("ABC123"));
        assertEquals("FiberHome", SnUtil.normalizeBrand("fiber home"));
        assertEquals("Huawei", SnUtil.resolveBrand("ABC", "huawei"));
    }

    @Test
    public void duplicateCollectScanIsRejectedWithoutItemMutation() {
        ScanSession session = SessionOps.create(ScanSession.MODE_COLLECT, "Test", T1);
        SessionOps.Result first = SessionOps.addScan(session, "SN 001", null, T1);
        assertEquals(SessionOps.Status.NEW, first.status);
        SessionOps.Result second = SessionOps.addScan(session, "sn001", null, T2);
        assertEquals(SessionOps.Status.DUP, second.status);
        assertEquals(1, session.items.size());
        assertEquals("SN 001", session.items.get(0).sn);
        assertEquals(T1, session.items.get(0).lastAt);
        assertEquals(1, session.duplicateScans);
        assertEquals(2, SessionOps.summary(session).totalScans);
        assertEquals(1, SessionOps.summary(session).duplicates);
    }

    @Test
    public void activeBrandOverridesGuessAndEditRejectsAnotherSerial() {
        ScanSession session = SessionOps.create(ScanSession.MODE_COLLECT, "Test", T1);
        session.activeBrand = "Huawei";
        SessionOps.addScan(session, "ZTEGC1", null, T1);
        assertEquals("Huawei", session.items.get(0).brand);
        SessionOps.addScan(session, "B2", null, T1);
        SessionOps.Meta meta = new SessionOps.Meta();
        meta.sn = "ZTEGC1";
        meta.brand = "auto";
        SessionOps.UpdateResult result = SessionOps.replaceItem(session, "B2", meta);
        assertEquals(SessionOps.UpdateStatus.DUP, result.status);
        assertEquals("B2", session.bySn("B2").sn);
        assertEquals("Huawei", session.bySn("B2").brand);
    }

    @Test
    public void matchMarksFoundOnlyOnceAndCountsUnmatched() {
        ScanSession session = SessionOps.create(ScanSession.MODE_MATCH, "Cocok", T1);
        SessionOps.setExpected(session, Arrays.asList("AAA-1", "AAA-2"), T1);
        SessionOps.Result found = SessionOps.addScan(session, "aaa-1", null, T2);
        assertEquals(SessionOps.Status.MATCHED, found.status);
        assertEquals(1, session.foundCount());
        SessionOps.Result again = SessionOps.addScan(session, "AAA-1", null, T2);
        assertEquals(SessionOps.Status.ALREADY, again.status);
        SessionOps.Result missing = SessionOps.addScan(session, "ZZZ", null, T2);
        assertEquals(SessionOps.Status.UNMATCHED, missing.status);
        SessionOps.Result missingAgain = SessionOps.addScan(session, "zzz", null, T2);
        assertEquals(SessionOps.Status.UNMATCHED_DUP, missingAgain.status);
        assertEquals(1, session.unmatched.size());
        assertEquals(2, session.unmatched.get(0).count);
        SessionOps.Summary summary = SessionOps.summary(session);
        assertEquals(2, summary.unique);
        assertEquals(1, summary.matched);
        assertEquals(1, summary.remaining);
        assertEquals(3, summary.totalScans);
    }

    @Test
    public void recapIsOneColumnPerBrandWithJumlahRow() {
        List<ScanItem> items = new ArrayList<>();
        items.add(new ScanItem("ZTE1", "ZTE", T1, T1));
        items.add(new ScanItem("ZTE2", "ZTE", T1, T1));
        items.add(new ScanItem("HW1", "Huawei", T1, T1));
        SessionOps.Recap recap = SessionOps.collectRecap(items);
        assertEquals(Arrays.asList("No", "ZTE", "Huawei"), recap.headers);
        assertEquals(3, recap.rows.size());
        assertEquals("jumlah", recap.rows.get(2).get(0));
        assertEquals(2, recap.rows.get(2).get(1));
        assertEquals(1, recap.rows.get(2).get(2));
    }

    @Test
    public void importParserReadsHeaderVariantsAndDropsDuplicates() {
        ImportParser.Result result = ImportParser.parse(
                "No;Kode Barang;Merk\n1;ZTEGC1;ZTE\n2;HWTC2;Huawei\n3;zte gc1;ZTE\n4;;ZTE\n");
        assertEquals(2, result.items.size());
        assertEquals("ZTEGC1", result.items.get(0));
        assertEquals("HWTC2", result.items.get(1));
        assertTrue(result.duplicates >= 1);
    }

    @Test
    public void importParserAcceptsPlainText() {
        ImportParser.Result result = ImportParser.parse("SN-1\n\nSN-2\nSN-1\n");
        assertEquals(2, result.items.size());
        assertEquals(1, result.duplicates);
    }

    @Test
    public void xlsxRowsRoundTripHonoursBlankFirstColumn() throws Exception {
        XlsxWriter.Sheet sheet = new XlsxWriter.Sheet("Data",
                Arrays.asList("", "Kode Barang", "Merk"),
                Arrays.asList(Arrays.asList("", "SN-A", "ZTE"),
                        Arrays.asList("", "SN-B", "Huawei")),
                new int[]{4, 24, 14});
        byte[] bytes = XlsxWriter.build(Arrays.asList(sheet));
        List<List<String>> rows = XlsxReader.read(new ByteArrayInputStream(bytes));
        assertEquals(3, rows.size());
        assertEquals("Kode Barang", rows.get(0).get(1));
        assertEquals("SN-A", rows.get(1).get(1));
        assertEquals("SN-B", rows.get(2).get(1));
        ImportParser.Result parsed = ImportParser.parseRows(rows);
        assertEquals(2, parsed.items.size());
        assertEquals("SN-A", parsed.items.get(0));
    }

    @Test
    public void collectWorkbookIsSingleRekapSheetAndCsvHasBom() throws Exception {
        ScanSession session = SessionOps.create(ScanSession.MODE_COLLECT, "Test", T1);
        SessionOps.addScan(session, "ZTEGC1", null, T1);
        SessionOps.addScan(session, "HWTC2", null, T1);
        ExportBuilder.ExportData data = ExportBuilder.build(session);
        assertEquals(1, data.sheets.size());
        assertEquals("Rekap", data.sheets.get(0).name);
        byte[] bytes = ExportBuilder.workbook(data);
        List<String> entries = new ArrayList<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) entries.add(entry.getName());
        }
        assertTrue(entries.contains("xl/workbook.xml"));
        assertTrue(entries.contains("xl/worksheets/sheet1.xml"));
        assertFalse(entries.contains("xl/worksheets/sheet2.xml"));
        byte[] csv = ExportBuilder.csv(data);
        assertEquals((byte) 0xEF, csv[0]);
        assertEquals((byte) 0xBB, csv[1]);
        assertEquals((byte) 0xBF, csv[2]);
        assertTrue(new String(csv, StandardCharsets.UTF_8).contains("ZTEGC1"));
        assertTrue(new String(csv, StandardCharsets.UTF_8).contains("jumlah"));
    }

    @Test
    public void matchWorkbookHasSummaryInventoryAndUnmatched() throws Exception {
        ScanSession session = SessionOps.create(ScanSession.MODE_MATCH, "Cocok", T1);
        SessionOps.setExpected(session, Arrays.asList("AAA-1", "AAA-2"), T1);
        SessionOps.addScan(session, "AAA-1", null, T2);
        SessionOps.addScan(session, "ZZZ", null, T2);
        ExportBuilder.ExportData data = ExportBuilder.build(session);
        assertEquals(3, data.sheets.size());
        assertEquals("Ringkasan", data.sheets.get(0).name);
        assertEquals("Inventory", data.sheets.get(1).name);
        assertEquals("Tidak Cocok", data.sheets.get(2).name);
        assertNotNull(ExportBuilder.workbook(data));
        String tsv = ExportBuilder.tsv(data);
        assertTrue(tsv.contains("Ketemu"));
        assertTrue(tsv.contains("Sisa"));
    }

    @Test
    public void xlsxWriterEscapesXmlAndUsesColumnLetters() throws Exception {
        XlsxWriter.Sheet sheet = new XlsxWriter.Sheet(
                "A&B",
                Arrays.asList("SN", "Catatan"),
                Arrays.asList(Arrays.asList("A<1>", "x & y"), Arrays.asList("B2", "ok")),
                new int[]{20, 30});
        byte[] bytes = XlsxWriter.build(Arrays.asList(sheet));
        String xml = null;
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (entry.getName().equals("xl/worksheets/sheet1.xml")) {
                    xml = new String(zip.readAllBytes(), StandardCharsets.UTF_8);
                }
            }
        }
        assertNotNull(xml);
        assertTrue(xml.contains("A&lt;1&gt;"));
        assertTrue(xml.contains("x &amp; y"));
        assertTrue(xml.contains("r=\"B2\""));
        assertTrue(xml.contains("state=\"frozen\""));
    }
}
