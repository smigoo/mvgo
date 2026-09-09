package com.mvgo.business.dto;

import java.util.List;

/**
 * 组件拆分结果中的单个组件信息.
 *
 * <p>对应需求文档第六章「业务组件梳理」的一个组件条目, 并补充第四章关联用例
 * 与 HTML 原型函数名核对结果.
 *
 * @since 1.0.0
 */
public class ComponentInfo {

    /** 列表序号, 前端以此作为列表 key 与勾选态的索引. */
    private int index;

    /** 列表副标题, 前端 strategyLabel 兜底原样展示 (此处填组件编码/模块). */
    private String strategy;

    /** 组件编码. */
    private String code;

    /** 组件名称. */
    private String name;

    /** 所属模块. */
    private String module;

    /** 状态 (新增/复用/待定等). */
    private String status;

    /** 功能描述. */
    private String funcDesc;

    /** 样式描述. */
    private String style;

    /** 关联功能点列表 (UC 编号). */
    private List<String> relatedUc;

    /** 界面元素清单描述. */
    private String uiElements;

    /** 关联的 HTML 页面 ID. */
    private String htmlPageId;

    /** 与 HTML main.js 函数名索引核对后的函数名列表. */
    private List<String> htmlFunctions;

    public int getIndex() {
        return index;
    }

    public void setIndex(int index) {
        this.index = index;
    }

    public String getStrategy() {
        return strategy;
    }

    public void setStrategy(String strategy) {
        this.strategy = strategy;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getModule() {
        return module;
    }

    public void setModule(String module) {
        this.module = module;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getFuncDesc() {
        return funcDesc;
    }

    public void setFuncDesc(String funcDesc) {
        this.funcDesc = funcDesc;
    }

    public String getStyle() {
        return style;
    }

    public void setStyle(String style) {
        this.style = style;
    }

    public List<String> getRelatedUc() {
        return relatedUc;
    }

    public void setRelatedUc(List<String> relatedUc) {
        this.relatedUc = relatedUc;
    }

    public String getUiElements() {
        return uiElements;
    }

    public void setUiElements(String uiElements) {
        this.uiElements = uiElements;
    }

    public String getHtmlPageId() {
        return htmlPageId;
    }

    public void setHtmlPageId(String htmlPageId) {
        this.htmlPageId = htmlPageId;
    }

    public List<String> getHtmlFunctions() {
        return htmlFunctions;
    }

    public void setHtmlFunctions(List<String> htmlFunctions) {
        this.htmlFunctions = htmlFunctions;
    }
}
