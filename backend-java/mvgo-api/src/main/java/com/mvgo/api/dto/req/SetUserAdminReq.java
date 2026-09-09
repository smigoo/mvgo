package com.mvgo.api.dto.req;

/**
 * 设置用户管理员标志请求.
 *
 * @since 1.0.0
 */
public class SetUserAdminReq {

    private boolean isAdmin;

    public boolean isAdmin() {
        return isAdmin;
    }

    public void setIsAdmin(boolean isAdmin) {
        this.isAdmin = isAdmin;
    }
}
