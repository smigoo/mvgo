package com.mvgo.business.dto;

/**
 * 组件列表查询参数（对齐 Node ListComponentsDto）.
 *
 * @since 1.0.0
 */
public class ListComponentsQuery {

    private String groupId;
    private String search;
    private String creator;
    private String sortBy;
    private Integer page;
    private Integer pageSize;

    public ListComponentsQuery() {}

    public ListComponentsQuery(String search, String sortBy, int page, int pageSize) {
        this.search = search;
        this.sortBy = sortBy;
        this.page = page;
        this.pageSize = pageSize;
    }

    public String getGroupId() { return groupId; }
    public void setGroupId(String groupId) { this.groupId = groupId; }

    public String getSearch() { return search; }
    public void setSearch(String search) { this.search = search; }

    public String getCreator() { return creator; }
    public void setCreator(String creator) { this.creator = creator; }

    public String getSortBy() { return sortBy; }
    public void setSortBy(String sortBy) { this.sortBy = sortBy; }

    public Integer getPage() { return page; }
    public void setPage(Integer page) { this.page = page; }

    public Integer getPageSize() { return pageSize; }
    public void setPageSize(Integer pageSize) { this.pageSize = pageSize; }
}
