package com.mvgo.business.util;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.poi.xwpf.usermodel.IBodyElement;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFStyle;
import org.apache.poi.xwpf.usermodel.XWPFStyles;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTP;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTPPr;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTStyle;

/**
 * 需求文档 (docx) 解析工具.
 *
 * <p>按 Word 标题大纲层级 (outlineLvl) 遍历正文: 一级标题 (Heading 1, outlineLvl=0) 用于切分章节,
 * 其中标题含「功能需求描述」的章节视为第四章, 含「业务组件梳理」的视为第六章.
 * 第六章内二级标题 (Heading 2) 为组件条目 (格式「组件名称（组件编码）」), 三级标题 (Heading 3) 为字段,
 * 其后的普通段落/表格为字段值. 解析基于常见需求文档结构的启发式规则, 若实际文档结构与预期不符需提供样本校准.
 *
 * @since 1.0.0
 */
public final class DocxSplitUtil {

    /** 一级标题关键词 → 章节别名 (第四章). */
    private static final Pattern CH4_TITLE_PATTERN =
            Pattern.compile("功能需求描述");

    /** 一级标题关键词 → 章节别名 (第六章). */
    private static final Pattern CH6_TITLE_PATTERN =
            Pattern.compile("业务组件梳理");

    /** 样式名中的标题层级, 例如 "heading 1" / "标题 1". */
    private static final Pattern HEADING_NAME_PATTERN =
            Pattern.compile("(?:heading|标题)\\s*(\\d+)", Pattern.CASE_INSENSITIVE);

    /** 组件二级标题: 名称（编码）, 兼容全角/半角括号. */
    private static final Pattern COMPONENT_TITLE_PATTERN =
            Pattern.compile("^\\s*(.+?)\\s*[（(]([^（）()]+)[）)]\\s*$");

    /** 用例编号匹配: 形如 "UC_R_ZBGK_ZLGK" / "UC_B_ZBGL_XJZB" (字母数字段). */
    private static final Pattern UC_PATTERN =
            Pattern.compile("UC[_\\-]?[A-Z0-9]+(?:[_\\-][A-Z0-9]+)*", Pattern.CASE_INSENSITIVE);

    private DocxSplitUtil() {
    }

    /**
     * 按一级标题切分文档正文, 章节 key 为顺序序号 (1,2,3...),
     * 并对第四章/第六章额外写入别名 key "4" / "6" 便于检索.
     *
     * @param docxBytes docx 文件字节
     * @return key 为章节序号或别名, value 为该章节的元素文本列表
     */
    public static Map<String, List<String>> parseChapters(byte[] docxBytes) {
        Map<String, List<String>> chapters = new LinkedHashMap<>();
        String current = "前言";
        chapters.put(current, new ArrayList<>());
        int h1Count = 0;
        try (InputStream in = new ByteArrayInputStream(docxBytes);
             XWPFDocument doc = new XWPFDocument(in)) {
            XWPFStyles styles = doc.getStyles();
            for (IBodyElement element : doc.getBodyElements()) {
                if (!(element instanceof XWPFParagraph)) {
                    if (current != null) {
                        String t = elementToText(element);
                        if (t != null && !t.isBlank()) {
                            chapters.get(current).add(t);
                        }
                    }
                    continue;
                }
                XWPFParagraph p = (XWPFParagraph) element;
                String text = p.getText();
                Integer ol = outlineLevel(p, styles);
                if (ol != null && ol == 0) {
                    h1Count++;
                    String key = String.valueOf(h1Count);
                    current = key;
                    chapters.putIfAbsent(key, new ArrayList<>());
                    String trimmed = text == null ? "" : text.trim();
                    if (CH4_TITLE_PATTERN.matcher(trimmed).find()) {
                        chapters.put("4", chapters.get(key));
                    } else if (CH6_TITLE_PATTERN.matcher(trimmed).find()) {
                        chapters.put("6", chapters.get(key));
                    }
                    continue;
                }
                if (current != null && text != null && !text.isBlank()) {
                    chapters.get(current).add(text);
                }
            }
        } catch (Exception e) {
            throw new RuntimeException("解析 docx 失败: " + e.getMessage(), e);
        }
        return chapters;
    }

    /**
     * 结构化提取第六章组件块.
     *
     * <p>遍历文档定位第六章, 将每个二级标题 (组件) 及其三级字段展开为「字段：值」合成文本块,
     * 以便复用 {@link #pickField} 等既有逻辑. 返回的每个字符串即为一个组件的完整文本.
     *
     * @param docxBytes docx 文件字节
     * @return 组件合成文本块列表
     */
    public static List<String> extractComponentBlocks(byte[] docxBytes) {
        List<String> blocks = new ArrayList<>();
        StringBuilder cur = null;
        String pendingField = null;
        boolean inCh6 = false;
        try (InputStream in = new ByteArrayInputStream(docxBytes);
             XWPFDocument doc = new XWPFDocument(in)) {
            XWPFStyles styles = doc.getStyles();
            for (IBodyElement element : doc.getBodyElements()) {
                if (element instanceof XWPFParagraph) {
                    XWPFParagraph p = (XWPFParagraph) element;
                    String text = p.getText();
                    String trimmed = text == null ? "" : text.trim();
                    Integer ol = outlineLevel(p, styles);
                    if (ol != null && ol == 0) {
                        if (cur != null) {
                            blocks.add(cur.toString().trim());
                            cur = null;
                        }
                        pendingField = null;
                        inCh6 = CH6_TITLE_PATTERN.matcher(trimmed).find();
                        continue;
                    }
                    if (!inCh6) {
                        continue;
                    }
                    if (ol != null && ol == 1) {
                        if (cur != null) {
                            blocks.add(cur.toString().trim());
                        }
                        cur = new StringBuilder();
                        pendingField = null;
                        Matcher cm = COMPONENT_TITLE_PATTERN.matcher(trimmed);
                        if (cm.find()) {
                            cur.append("组件名称：").append(cm.group(1).trim()).append("\n");
                            cur.append("组件编码：").append(cm.group(2).trim()).append("\n");
                        } else {
                            cur.append("组件名称：").append(trimmed).append("\n");
                            cur.append("组件编码：\n");
                        }
                        continue;
                    }
                    if (ol != null && ol == 2) {
                        pendingField = trimmed;
                        continue;
                    }
                    if (cur == null) {
                        continue;
                    }
                    if (pendingField != null) {
                        cur.append(pendingField).append("：").append(trimmed).append("\n");
                        pendingField = null;
                    }
                } else if (element instanceof XWPFTable) {
                    if (inCh6 && cur != null && pendingField != null) {
                        cur.append(pendingField).append("：").append(tableToMarkdown((XWPFTable) element)).append("\n");
                        pendingField = null;
                    }
                }
            }
            if (cur != null) {
                blocks.add(cur.toString().trim());
            }
        } catch (Exception e) {
            throw new RuntimeException("解析 docx 组件失败: " + e.getMessage(), e);
        }
        return blocks;
    }

    /**
     * 从第四章文本中按 UC 编号切分用例块.
     *
     * @param chapterText 第四章全部文本 (按元素拼接)
     * @return key 为 UC 编号 (大写), value 为用例内容
     */
    public static Map<String, String> extractUseCases(List<String> chapterText) {
        Map<String, String> cases = new LinkedHashMap<>();
        String currentUc = null;
        StringBuilder buf = new StringBuilder();
        for (String line : chapterText) {
            Matcher m = UC_PATTERN.matcher(line);
            if (m.find()) {
                if (currentUc != null) {
                    cases.put(currentUc, buf.toString().trim());
                }
                currentUc = m.group().toUpperCase();
                buf = new StringBuilder();
                buf.append(line).append("\n");
            } else if (currentUc != null) {
                buf.append(line).append("\n");
            }
        }
        if (currentUc != null) {
            cases.put(currentUc, buf.toString().trim());
        }
        return cases;
    }

    /**
     * 计算段落的大纲层级 (outlineLvl). 优先读段落属性, 其次读样式属性, 最后由样式名推断.
     *
     * @param p      段落
     * @param styles 文档样式表
     * @return 大纲层级 (0=一级标题), 非标题返回 null
     */
    private static Integer outlineLevel(XWPFParagraph p, XWPFStyles styles) {
        CTP ctp = p.getCTP();
        CTPPr pPr = ctp.getPPr();
        if (pPr != null && pPr.getOutlineLvl() != null) {
            return pPr.getOutlineLvl().getVal().intValue();
        }
        String sid = p.getStyleID();
        if (sid != null && styles != null) {
            XWPFStyle style = styles.getStyle(sid);
            if (style != null) {
                CTStyle ct = style.getCTStyle();
                if (ct != null && ct.getPPr() != null && ct.getPPr().getOutlineLvl() != null) {
                    return ct.getPPr().getOutlineLvl().getVal().intValue();
                }
                String name = style.getName();
                if (name != null) {
                    Matcher m = HEADING_NAME_PATTERN.matcher(name);
                    if (m.find()) {
                        return Integer.parseInt(m.group(1)) - 1;
                    }
                }
            }
        }
        return null;
    }

    /**
     * 将单个 body 元素转为纯文本 (段落或表格, 表格转为 Markdown 表格).
     *
     * @param element body 元素
     * @return 文本
     */
    private static String elementToText(IBodyElement element) {
        if (element instanceof XWPFParagraph) {
            return ((XWPFParagraph) element).getText();
        }
        if (element instanceof XWPFTable) {
            return tableToMarkdown((XWPFTable) element);
        }
        return "";
    }

    /**
     * 表格转 Markdown 文本.
     *
     * @param table 表格
     * @return Markdown 表格
     */
    private static String tableToMarkdown(XWPFTable table) {
        StringBuilder sb = new StringBuilder();
        List<XWPFTableRow> rows = table.getRows();
        for (int i = 0; i < rows.size(); i++) {
            XWPFTableRow row = rows.get(i);
            sb.append("| ");
            for (XWPFTableCell cell : row.getTableCells()) {
                sb.append(cell.getText().replace("\n", " ").trim()).append(" | ");
            }
            sb.append("\n");
            if (i == 0) {
                sb.append("| ");
                for (int c = 0; c < row.getTableCells().size(); c++) {
                    sb.append("--- | ");
                }
                sb.append("\n");
            }
        }
        return sb.toString();
    }

    /**
     * 从文本块中提取字段值 (形如 "组件名称：xxx" 或 "组件名称: xxx").
     *
     * @param block 文本块
     * @param label 字段名 (如 "组件编码")
     * @return 字段值, 不存在返回空串
     */
    public static String pickField(String block, String label) {
        Pattern p = Pattern.compile("(?m)^\\s*" + Pattern.quote(label) + "\\s*[:：][ \\t]*(.*)$");
        Matcher m = p.matcher(block);
        if (m.find()) {
            return m.group(1).trim();
        }
        return "";
    }

    /**
     * 从文本块中提取所有关联的 UC 编号.
     *
     * @param block 文本块
     * @return UC 编号列表
     */
    public static List<String> pickUcList(String block) {
        List<String> list = new ArrayList<>();
        Matcher m = UC_PATTERN.matcher(block);
        while (m.find()) {
            String uc = m.group().toUpperCase();
            if (!list.contains(uc)) {
                list.add(uc);
            }
        }
        return list;
    }
}
