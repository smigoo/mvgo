package com.mvgo.business.dto;

import java.util.List;

/**
 * 管理后台组件分页结果.
 *
 * @since 1.0.0
 */
public class AdminComponentPage {

    private List<AdminComponentVO> list;
    private long total;
    private int page;
    private int pageSize;

    public List<AdminComponentVO> getList() {
        return list;
    }

    public void setList(List<AdminComponentVO> list) {
        this.list = list;
    }

    public long getTotal() {
        return total;
    }

    public void setTotal(long total) {
        this.total = total;
    }

    public int getPage() {
        return page;
    }

    public void setPage(int page) {
        this.page = page;
    }

    public int getPageSize() {
        return pageSize;
    }

    public void setPageSize(int pageSize) {
        this.pageSize = pageSize;
    }
}
