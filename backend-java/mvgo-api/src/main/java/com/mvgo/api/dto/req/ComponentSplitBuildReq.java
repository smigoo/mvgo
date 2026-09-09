package com.mvgo.api.dto.req;

import java.util.List;

/**
 * 组件拆分交付包生成请求.
 *
 * @since 1.0.0
 */
public class ComponentSplitBuildReq {

    /** HTML 原型源码. */
    private String htmlContent;

    /** HTML 文件名. */
    private String htmlFileName;

    /** 需求文档 base64. */
    private String docxBase64;

    /** 需求文档文件名. */
    private String docxName;

    /** 选中的组件编码列表 (为空表示全部). */
    private List<String> selectedCodes;

    public String getHtmlContent() {
        return htmlContent;
    }

    public void setHtmlContent(String htmlContent) {
        this.htmlContent = htmlContent;
    }

    public String getHtmlFileName() {
        return htmlFileName;
    }

    public void setHtmlFileName(String htmlFileName) {
        this.htmlFileName = htmlFileName;
    }

    public String getDocxBase64() {
        return docxBase64;
    }

    public void setDocxBase64(String docxBase64) {
        this.docxBase64 = docxBase64;
    }

    public String getDocxName() {
        return docxName;
    }

    public void setDocxName(String docxName) {
        this.docxName = docxName;
    }

    public List<String> getSelectedCodes() {
        return selectedCodes;
    }

    public void setSelectedCodes(List<String> selectedCodes) {
        this.selectedCodes = selectedCodes;
    }
}
