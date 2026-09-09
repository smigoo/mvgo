package com.mvgo.business.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import com.mvgo.business.dto.ComponentInfo;
import com.mvgo.business.dto.ComponentSplitAnalyzeResult;
import com.mvgo.business.util.DocxSplitUtil;
import com.mvgo.business.util.HtmlFnIndex;
import com.mvgo.common.BizException;
import org.springframework.stereotype.Service;

/**
 * 组件拆分业务服务.
 *
 * <p>对齐「组件拆分」Skill: 解析需求文档第四/六章, 结合 HTML 原型函数索引, 输出组件列表;
 * 并按模板生成组件需求 MD, 打包为交付 zip.
 *
 * @since 1.0.0
 */
@Service
public class ComponentSplitService {

    private static final List<String> EMPTY = List.of();

    /**
     * 分析需求文档 + HTML 原型, 输出组件列表.
     *
     * @param docxBytes  需求文档字节 (可空)
     * @param htmlContent HTML 原型源码
     * @return 分析结果
     */
    public ComponentSplitAnalyzeResult analyze(byte[] docxBytes, String htmlContent) {
        ComponentSplitAnalyzeResult result = new ComponentSplitAnalyzeResult();
        if (docxBytes == null || docxBytes.length == 0) {
            result.setHasDocx(false);
            result.setRemark("未提供需求文档, 无法解析组件. 请上传包含第四/六章的 docx.");
            result.setComponents(List.of());
            return result;
        }
        result.setHasDocx(true);

        Map<String, List<String>> chapters = DocxSplitUtil.parseChapters(docxBytes);
        List<String> ch4 = getChapter(chapters, "4");
        List<String> ch6 = getChapter(chapters, "6");
        Map<String, String> ucMap = DocxSplitUtil.extractUseCases(ch4);
        Set<String> fnIndex = HtmlFnIndex.build(htmlContent);
        List<String> blocks = DocxSplitUtil.extractComponentBlocks(docxBytes);

        List<ComponentInfo> components = new ArrayList<>();
        for (String block : blocks) {
            ComponentInfo info = new ComponentInfo();
            fillInfo(info, block, fnIndex);
            if (info.getCode().isEmpty() && info.getName().isEmpty()) {
                continue;
            }
            info.setIndex(components.size());
            info.setStrategy(firstNonEmpty(info.getCode(), info.getModule(), info.getStatus()));
            components.add(info);
        }
        result.setComponents(components);

        StringBuilder remark = new StringBuilder();
        if (ch4.isEmpty()) {
            remark.append("未找到第四章; ");
        }
        if (ch6.isEmpty()) {
            remark.append("未找到第六章; ");
        }
        if (blocks.isEmpty()) {
            remark.append("第六章未解析到组件条目; ");
        }
        result.setRemark(remark.length() == 0 ? "解析完成" : remark.toString());
        return result;
    }

    /**
     * 生成组件需求交付包 (zip 字节).
     *
     * @param docxBytes     需求文档字节
     * @param htmlContent   HTML 原型源码
     * @param selectedCodes 选中的组件编码列表 (为空表示全部)
     * @return zip 字节流
     */
    public byte[] build(byte[] docxBytes, String htmlContent, List<String> selectedCodes) {
        if (docxBytes == null || docxBytes.length == 0) {
            throw new BizException("生成交付包需要需求文档(docx)");
        }
        List<String> codes = selectedCodes == null ? EMPTY : selectedCodes;

        Map<String, List<String>> chapters = DocxSplitUtil.parseChapters(docxBytes);
        List<String> ch4 = getChapter(chapters, "4");
        List<String> ch6 = getChapter(chapters, "6");
        Map<String, String> ucMap = DocxSplitUtil.extractUseCases(ch4);
        Set<String> fnIndex = HtmlFnIndex.build(htmlContent);
        List<String> blocks = DocxSplitUtil.extractComponentBlocks(docxBytes);

        List<ComponentInfo> selected = new ArrayList<>();
        for (String block : blocks) {
            String code = firstNonEmpty(DocxSplitUtil.pickField(block, "组件编码"),
                    DocxSplitUtil.pickField(block, "编码"));
            if (codes.isEmpty() || codes.contains(code)) {
                ComponentInfo info = new ComponentInfo();
                fillInfo(info, block, fnIndex);
                selected.add(info);
            }
        }
        if (selected.isEmpty()) {
            throw new BizException("未匹配到任何组件, 请检查选中的组件编码");
        }

        return packZip(selected, ucMap, htmlContent, docxBytes);
    }

    private byte[] packZip(List<ComponentInfo> selected, Map<String, String> ucMap,
                           String htmlContent, byte[] docxBytes) {
        try (ByteArrayOutputStream baos = new ByteArrayOutputStream();
             ZipOutputStream zos = new ZipOutputStream(baos)) {
            addEntry(zos, "原材料/index.html", htmlContent == null ? "" : htmlContent);
            addEntry(zos, "原材料/需求文档.docx", docxBytes);

            StringBuilder mapping = new StringBuilder();
            int idx = 1;
            for (ComponentInfo info : selected) {
                String ucContent = info.getRelatedUc().stream()
                        .map(ucMap::get)
                        .filter(Objects::nonNull)
                        .collect(Collectors.joining("\n\n"));
                String md = buildComponentMd(info, ucContent);
                String fileName = String.format("%02d_%s_%s.md", idx,
                        sanitize(info.getName()), sanitize(info.getCode()));
                addEntry(zos, "组件MD/" + fileName, md);
                mapping.append("| ").append(info.getCode()).append(" | ")
                        .append(info.getName()).append(" | ")
                        .append(info.getModule()).append(" | ")
                        .append(String.join("、", info.getRelatedUc())).append(" | ")
                        .append(String.join("、", info.getHtmlFunctions())).append(" |\n");
                idx++;
            }
            addEntry(zos, "00_交付说明.md", buildReadme(selected, mapping.toString()));
            zos.finish();
            return baos.toByteArray();
        } catch (IOException e) {
            throw new BizException("打包交付包失败: " + e.getMessage());
        }
    }

    private String buildComponentMd(ComponentInfo info, String ucContent) {
        StringBuilder sb = new StringBuilder();
        sb.append("# ").append(info.getName()).append("（").append(info.getCode()).append("）\n\n");
        sb.append("## 一、组件基本信息\n");
        sb.append("- 组件名称：").append(info.getName()).append("\n");
        sb.append("- 组件编码：").append(info.getCode()).append("\n");
        sb.append("- 所属模块：").append(info.getModule()).append("\n");
        sb.append("- 状态：").append(info.getStatus()).append("\n");
        sb.append("- 功能描述：").append(info.getFuncDesc()).append("\n");
        sb.append("- 样式：").append(info.getStyle()).append("\n");
        sb.append("- 关联功能点：").append(String.join("、", info.getRelatedUc())).append("\n\n");
        sb.append("## 二、功能描述\n").append(info.getFuncDesc()).append("\n\n");
        sb.append("## 三、关联用例清单\n");
        if (info.getRelatedUc().isEmpty()) {
            sb.append("（无）\n");
        } else {
            info.getRelatedUc().forEach(uc -> sb.append("- ").append(uc).append("\n"));
        }
        sb.append("\n## 四、界面元素清单\n").append(info.getUiElements()).append("\n\n");
        sb.append("## 五、交互逻辑\n");
        sb.append(ucContent == null || ucContent.isEmpty() ? "（对应用例内容缺失）" : ucContent)
                .append("\n\n");
        sb.append("## 六、HTML 原型对应关系\n");
        sb.append("- 页面 ID：").append(info.getHtmlPageId()).append("\n");
        sb.append("- 关键 DOM：（待补充）\n");
        sb.append("- JS 函数名：").append(String.join("、", info.getHtmlFunctions())).append("\n");
        sb.append("- 转 Vue 提示：（根据函数名对照 main.js 手动迁移）\n");
        return sb.toString();
    }

    private String buildReadme(List<ComponentInfo> selected, String mappingRows) {
        StringBuilder sb = new StringBuilder();
        sb.append("# 组件拆分交付说明\n\n");
        sb.append("> 由「组件拆分」Skill 自动生成。\n\n");
        sb.append("## 组件清单\n\n");
        sb.append("| 组件编码 | 组件名称 | 所属模块 | 关联 UC | HTML 函数 |\n");
        sb.append("| --- | --- | --- | --- | --- |\n");
        sb.append(mappingRows).append("\n");
        sb.append("## 目录结构\n\n");
        sb.append("```\n");
        sb.append("交付文件夹/\n");
        sb.append("├── 00_交付说明.md\n");
        sb.append("├── 原材料/\n");
        sb.append("│   ├── 需求文档.docx\n");
        sb.append("│   └── index.html\n");
        sb.append("└── 组件MD/\n");
        for (int i = 1; i <= selected.size(); i++) {
            sb.append("    └── ").append(String.format("%02d", i)).append("_*.md\n");
        }
        sb.append("```\n");
        return sb.toString();
    }

    private void fillInfo(ComponentInfo info, String block, Set<String> fnIndex) {
        info.setCode(firstNonEmpty(DocxSplitUtil.pickField(block, "组件编码"),
                DocxSplitUtil.pickField(block, "编码")));
        info.setName(firstNonEmpty(DocxSplitUtil.pickField(block, "组件名称"),
                DocxSplitUtil.pickField(block, "名称")));
        info.setModule(firstNonEmpty(DocxSplitUtil.pickField(block, "所属模块"),
                DocxSplitUtil.pickField(block, "模块")));
        info.setStatus(firstNonEmpty(DocxSplitUtil.pickField(block, "组件状态"),
                DocxSplitUtil.pickField(block, "状态")));
        info.setFuncDesc(firstNonEmpty(DocxSplitUtil.pickField(block, "组件功能描述"),
                DocxSplitUtil.pickField(block, "组件用途说明"),
                DocxSplitUtil.pickField(block, "功能描述"),
                DocxSplitUtil.pickField(block, "功能说明"),
                DocxSplitUtil.pickField(block, "功能")));
        info.setStyle(firstNonEmpty(DocxSplitUtil.pickField(block, "组件样式"),
                DocxSplitUtil.pickField(block, "样式")));
        info.setUiElements(firstNonEmpty(DocxSplitUtil.pickField(block, "界面元素"),
                DocxSplitUtil.pickField(block, "界面")));
        info.setHtmlPageId(firstNonEmpty(DocxSplitUtil.pickField(block, "页面ID"),
                DocxSplitUtil.pickField(block, "页面")));
        info.setRelatedUc(DocxSplitUtil.pickUcList(block));
        info.setHtmlFunctions(resolveHtmlFns(block, fnIndex));
    }

    private List<String> resolveHtmlFns(String block, Set<String> fnIndex) {
        List<String> result = new ArrayList<>();
        String val = DocxSplitUtil.pickField(block, "函数") + " "
                + DocxSplitUtil.pickField(block, "JS函数") + " "
                + DocxSplitUtil.pickField(block, "函数名");
        for (String token : val.split("[，,、\\s]+")) {
            if (!token.isEmpty() && fnIndex.contains(token) && !result.contains(token)) {
                result.add(token);
            }
        }
        return result;
    }

    private static List<String> getChapter(Map<String, List<String>> chapters, String... keys) {
        for (String k : keys) {
            if (chapters.containsKey(k)) {
                return chapters.get(k);
            }
        }
        return EMPTY;
    }

    private static String firstNonEmpty(String... values) {
        for (String v : values) {
            if (v != null && !v.isEmpty()) {
                return v;
            }
        }
        return "";
    }

    private static String sanitize(String s) {
        if (s == null || s.isEmpty()) {
            return "untitled";
        }
        return s.replaceAll("[\\\\/:*?\"<>|\\s]+", "_");
    }

    private static void addEntry(ZipOutputStream zos, String name, String content) throws IOException {
        zos.putNextEntry(new ZipEntry(name));
        zos.write(content.getBytes(StandardCharsets.UTF_8));
        zos.closeEntry();
    }

    private static void addEntry(ZipOutputStream zos, String name, byte[] content) throws IOException {
        zos.putNextEntry(new ZipEntry(name));
        zos.write(content);
        zos.closeEntry();
    }
}
