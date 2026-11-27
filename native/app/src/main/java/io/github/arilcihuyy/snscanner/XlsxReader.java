package io.github.arilcihuyy.snscanner;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import javax.xml.parsers.DocumentBuilderFactory;

/**
 * Minimal XLSX reader for importing a serial-number column.
 * Reads the first worksheet and shared strings, honouring cell r references
 * so blank/intervening columns do not shift values.
 */
public final class XlsxReader {
    private XlsxReader() {
    }

    public static List<List<String>> read(InputStream input) throws Exception {
        Map<String, byte[]> entries = unzip(input);
        List<String> shared = new ArrayList<>();
        byte[] sharedXml = entries.get("xl/sharedStrings.xml");
        if (sharedXml != null) {
            Document doc = parse(sharedXml);
            NodeList items = doc.getElementsByTagName("si");
            for (int i = 0; i < items.getLength(); i++) {
                shared.add(textOf((Element) items.item(i)));
            }
        }
        String sheetName = null;
        for (int i = 1; i <= 200 && sheetName == null; i++) {
            String candidate = "xl/worksheets/sheet" + i + ".xml";
            if (entries.containsKey(candidate)) sheetName = candidate;
        }
        if (sheetName == null) {
            for (String name : entries.keySet()) {
                if (name.matches("xl/worksheets/sheet\\d+\\.xml")) {
                    sheetName = name;
                    break;
                }
            }
        }
        if (sheetName == null) throw new IllegalStateException("Sheet tidak ditemukan dalam file XLSX");

        Document doc = parse(entries.get(sheetName));
        List<List<String>> rows = new ArrayList<>();
        NodeList rowNodes = doc.getElementsByTagName("row");
        for (int r = 0; r < rowNodes.getLength(); r++) {
            Element row = (Element) rowNodes.item(r);
            List<String> cells = new ArrayList<>();
            NodeList cellNodes = row.getElementsByTagName("c");
            int sequential = 0;
            for (int c = 0; c < cellNodes.getLength(); c++) {
                Element cell = (Element) cellNodes.item(c);
                int index = columnIndex(cell.getAttribute("r"));
                if (index < 0) index = sequential;
                while (cells.size() < index) cells.add("");
                String value = cellText(cell, shared);
                if (cells.size() == index) cells.add(value);
                else cells.set(index, value);
                sequential = index + 1;
            }
            rows.add(cells);
        }
        return rows;
    }

    private static Map<String, byte[]> unzip(InputStream input) throws Exception {
        Map<String, byte[]> entries = new HashMap<>();
        try (ZipInputStream zip = new ZipInputStream(input)) {
            ZipEntry entry;
            byte[] buffer = new byte[8192];
            while ((entry = zip.getNextEntry()) != null) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                int n;
                while ((n = zip.read(buffer)) > 0) out.write(buffer, 0, n);
                entries.put(entry.getName(), out.toByteArray());
            }
        }
        return entries;
    }

    private static Document parse(byte[] xml) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(false);
        factory.setExpandEntityReferences(false);
        return factory.newDocumentBuilder().parse(new ByteArrayInputStream(xml));
    }

    private static String cellText(Element cell, List<String> shared) {
        String type = cell.getAttribute("t");
        if ("inlineStr".equals(type)) return textOf(cell);
        NodeList values = cell.getElementsByTagName("v");
        String value = values.getLength() == 0 ? "" : values.item(0).getTextContent();
        if ("s".equals(type)) {
            try {
                int index = Integer.parseInt(value.trim());
                return index >= 0 && index < shared.size() ? shared.get(index) : "";
            } catch (NumberFormatException e) {
                return "";
            }
        }
        return value == null ? "" : value;
    }

    /** Concatenate every t node; skips phonetic runs (rPh). */
    private static String textOf(Element element) {
        StringBuilder b = new StringBuilder();
        collectText(element, b);
        return b.toString();
    }

    private static void collectText(Node node, StringBuilder b) {
        NodeList children = node.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            Node child = children.item(i);
            if (child.getNodeType() != Node.ELEMENT_NODE) continue;
            String name = child.getNodeName();
            if ("rPh".equals(name)) continue;
            if ("t".equals(name)) {
                b.append(child.getTextContent());
            } else {
                collectText(child, b);
            }
        }
    }

    private static int columnIndex(String reference) {
        if (reference == null || reference.isEmpty()) return -1;
        int index = 0;
        int letters = 0;
        for (int i = 0; i < reference.length(); i++) {
            char c = reference.charAt(i);
            if (c >= 'A' && c <= 'Z') {
                index = index * 26 + (c - 'A' + 1);
                letters++;
            } else if (c >= 'a' && c <= 'z') {
                index = index * 26 + (c - 'a' + 1);
                letters++;
            } else {
                break;
            }
        }
        return letters == 0 ? -1 : index - 1;
    }
}
