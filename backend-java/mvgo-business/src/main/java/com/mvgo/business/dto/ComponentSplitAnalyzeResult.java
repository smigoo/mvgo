package com.mvgo.business.dto;

import java.util.List;

/**
 * 组件拆分分析接口返回.
 *
 * @since 1.0.0
 */
public class ComponentSplitAnalyzeResult {

    /** 解析得到的组件列表. */
    private List<ComponentInfo> components;

    /** 文档中是否包含需求文档 (docx). */
    private boolean hasDocx;

    /** 解析备注 (如缺章节警告). */
    private String remark;

    public List<ComponentInfo> getComponents() {
        return components;
    }

    public void setComponents(List<ComponentInfo> components) {
        this.components = components;
    }

    public boolean isHasDocx() {
        return hasDocx;
    }

    public void setHasDocx(boolean hasDocx) {
        this.hasDocx = hasDocx;
    }

    public String getRemark() {
        return remark;
    }

    public void setRemark(String remark) {
        this.remark = remark;
    }
}
