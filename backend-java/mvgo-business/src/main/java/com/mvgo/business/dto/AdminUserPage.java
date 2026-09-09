package com.mvgo.business.dto;

import java.util.List;

/**
 * 管理后台用户列表结果（对齐 Node {@code {success, list, total}} 经信封包裹后的 data）.
 *
 * @since 1.0.0
 */
public class AdminUserPage {

    private List<AdminUserVO> list;
    private int total;

    public AdminUserPage() {
    }

    public AdminUserPage(List<AdminUserVO> list, int total) {
        this.list = list;
        this.total = total;
    }

    public List<AdminUserVO> getList() {
        return list;
    }

    public void setList(List<AdminUserVO> list) {
        this.list = list;
    }

    public int getTotal() {
        return total;
    }

    public void setTotal(int total) {
        this.total = total;
    }
}
