package com.mvgo.api.dto.req;

/**
 * 组件拆分分析请求.
 *
 * @since 1.0.0
 */
public class ComponentSplitAnalyzeReq {

    /** HTML 原型源码. */
    private String htmlContent;

    /** HTML 文件名. */
    private String htmlFileName;

    /** 需求文档 base64 (可空, 含 data: 前缀亦可). */
    private String docxBase64;

    /** 需求文档文件名. */
    private String docxName;

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
}
