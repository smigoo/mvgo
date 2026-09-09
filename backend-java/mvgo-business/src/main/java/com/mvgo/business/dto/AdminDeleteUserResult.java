package com.mvgo.business.dto;

import java.util.List;

/**
 * 删除用户级联清理结果.
 *
 * @since 1.0.0
 */
public class AdminDeleteUserResult {

    private int deletedComponents;
    private List<String> cleanedCollections;

    public int getDeletedComponents() {
        return deletedComponents;
    }

    public void setDeletedComponents(int deletedComponents) {
        this.deletedComponents = deletedComponents;
    }

    public List<String> getCleanedCollections() {
        return cleanedCollections;
    }

    public void setCleanedCollections(List<String> cleanedCollections) {
        this.cleanedCollections = cleanedCollections;
    }
}
