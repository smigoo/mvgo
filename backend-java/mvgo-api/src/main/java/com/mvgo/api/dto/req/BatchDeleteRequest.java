package com.mvgo.api.dto.req;

import java.util.List;

/**
 * 批量删除请求.
 *
 * @since 1.0.0
 */
public class BatchDeleteRequest {

    private List<String> componentIds;

    public List<String> getComponentIds() { return componentIds; }
    public void setComponentIds(List<String> componentIds) { this.componentIds = componentIds; }
}
