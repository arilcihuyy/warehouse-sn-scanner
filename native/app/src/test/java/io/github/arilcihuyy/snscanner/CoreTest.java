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
    public void duplicateCollectScanIsRejectedWithoutMutation() {
        CollectSession session = new CollectSession();
        session.createdAt = T1;
        SessionOps.AddResult first = SessionOps.addCollect(session, "SN 001", SnUtil.BRAND_AUTO, T1);
        assertEquals(SessionOps.AddStatus.ADDED, first.status);
        SessionOps.AddResult second = SessionOps.addCollect(session, "sn001", SnUtil.BRAND_AUTO, T2);
        assertEquals(SessionOps.AddStatus.DUP, second.status);
        assertEquals(1, session.items.size());
        assertEquals("SN 001", session.items.get(0).sn);
        assertEquals(T1, session.items.get(0).lastAt);
    }

    @Test
    public void collectEditRejectsAnotherItemsSerial() {
        CollectSession session = new CollectSession();
        session.createdAt = T1;
        SessionOps.addCollect(session, "A1", SnUtil.BRAND_AUTO, T1);
        SessionOps.addCollect(session, "B2", SnUtil.BRAND_AUTO, T1);
        SessionOps.UpdateResult result = SessionOps.updateCollect(session, 1, "a1", "ZTE", T2);
        assertEquals(SessionOps.UpdateStatus.DUP, result.status);
        assertEquals("B2", session.items.get(1).sn);
        assertEquals("Lainnya", session.items.get(1).brand);
    }

    @Test
    public void matchMarksFoundOnlyOnce() {
        MatchSession session = new MatchSession();
        session.createdAt = T1;
        session.items.add(new MatchItem("AAA-1", MatchItem.PENDING, null));
        session.items.add(new MatchItem("AAA-2", MatchItem.PENDING, null));
        SessionOps.MatchResult found = SessionOps.markFound(session, "aaa-1", T2);
        assertEquals(SessionOps.MatchStatus.FOUND, found.status);
        assertEquals(1, session.foundCount());
        SessionOps.MatchResult again = SessionOps.markFound(session, "AAA-1", T2);
        assertEquals(SessionOps.MatchStatus.ALREADY, again.status);
        SessionOps.MatchResult missing = SessionOps.markFound(session, "ZZZ", T2);
        assertEquals(SessionOps.MatchStatus.NOT_TARGET, missing.status);
    }

    @Test
    public void importParserReadsSnColumnAndDropsDuplicates() {
        ImportParser.Result result = ImportParser.parse(
                "No;Serial Number;Merk\n1;ZTEGC1;ZTE\n2;HWTC2;Huawei\n3;zte gc1;ZTE\n4;;ZTE\n");
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
    public void collectWorkbookHasExpectedSheetsAndCsvBom() throws Exception {
        CollectSession session = new CollectSession();
        session.createdAt = T1;
        session.items.add(new CollectItem("ZTEGC1", "ZTE", T1, T2));
        session.items.add(new CollectItem("HWTC2", "Huawei", T1, T1));
        byte[] bytes = ExportBuilder.collectWorkbook(session);
        assertTrue(bytes.length > 1000);
        List<String> entries = new ArrayList<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) entries.add(entry.getName());
        }
        assertTrue(entries.contains("[Content_Types].xml"));
        assertTrue(entries.contains("xl/workbook.xml"));
        assertTrue(entries.contains("xl/worksheets/sheet1.xml"));
        assertTrue(entries.contains("xl/worksheets/sheet2.xml"));
        assertTrue(entries.contains("xl/worksheets/sheet3.xml"));
        assertTrue(entries.contains("xl/worksheets/sheet4.xml"));
        byte[] csv = ExportBuilder.collectCsv(session);
        assertEquals((byte) 0xEF, csv[0]);
        assertEquals((byte) 0xBB, csv[1]);
        assertEquals((byte) 0xBF, csv[2]);
        assertTrue(new String(csv, StandardCharsets.UTF_8).contains("ZTEGC1"));
    }

    @Test
    public void matchWorkbookAndTsvContainStatus() throws Exception {
        MatchSession session = new MatchSession();
        session.createdAt = T1;
        session.items.add(new MatchItem("AAA-1", MatchItem.FOUND, T2));
        session.items.add(new MatchItem("AAA-2", MatchItem.PENDING, null));
        byte[] bytes = ExportBuilder.matchWorkbook(session);
        assertNotNull(bytes);
        assertTrue(bytes.length > 500);
        assertTrue(ExportBuilder.matchTsv(session).contains("Ketemu"));
        assertTrue(ExportBuilder.matchTsv(session).contains("Sisa"));
    }

    @Test
    public void xlsxWriterEscapesXmlAndUsesColumnLetters() throws Exception {
        XlsxWriter.Sheet sheet = new XlsxWriter.Sheet(
                "A&B",
                Arrays.asList("SN", "Catatan"),
                Arrays.asList(Arrays.asList("A<1>", "x & y"), Arrays.asList("B2", "ok")),
                new int[]{20, 30});
        byte[] bytes = XlsxWriter.build(Arrays.asList(sheet));
        String xml;
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            ZipEntry entry;
            xml = null;
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
