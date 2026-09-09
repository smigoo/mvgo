package com.mvgo.business.util;

import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * HTML 原型函数名索引工具.
 *
 * <p>从 HTML 文本 (含内联或外联 main.js 源码) 中提取函数名, 用于核对需求文档第六章
 * 提到的 JS 函数是否真实存在于原型中.
 *
 * @since 1.0.0
 */
public final class HtmlFnIndex {

    private static final Pattern FN_PATTERN = Pattern.compile(
            "\\bfunction\\s+([A-Za-z_$][\\w$]*)\\s*\\(");

    private HtmlFnIndex() {
    }

    /**
     * 提取全部函数名.
     *
     * @param htmlText HTML 源码
     * @return 函数名集合
     */
    public static Set<String> build(String htmlText) {
        Set<String> names = new HashSet<>();
        if (htmlText == null || htmlText.isEmpty()) {
            return names;
        }
        Matcher m = FN_PATTERN.matcher(htmlText);
        while (m.find()) {
            names.add(m.group(1));
        }
        return names;
    }

    /**
     * 过滤出存在于索引中的函数名.
     *
     * @param candidates 候选函数名
     * @param index      函数名索引
     * @return 实际存在名称
     */
    public static Set<String> retainExisting(java.util.Collection<String> candidates, Set<String> index) {
        Set<String> result = new HashSet<>();
        for (String c : candidates) {
            if (index.contains(c)) {
                result.add(c);
            }
        }
        return result;
    }
}
