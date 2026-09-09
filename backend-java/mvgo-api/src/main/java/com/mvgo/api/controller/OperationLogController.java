package com.mvgo.api.controller;

import java.util.List;

import com.mvgo.api.dto.req.OperationLogReq;
import com.mvgo.business.dto.OperationLogPage;
import com.mvgo.business.dto.OperationLogQuery;
import com.mvgo.business.service.OperationLogService;
import com.mvgo.common.Result;
import com.mvgo.data.entity.OperationLog;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 操作日志接口.
 *
 * <p>写入由 Node 全局拦截器 fire-and-forget 上报；列表供管理后台只读查询。
 *
 * @since 1.0.0
 */
@RestController
@RequestMapping("/api/operation-log")
public class OperationLogController {

    private final OperationLogService service;

    public OperationLogController(OperationLogService service) {
        this.service = service;
    }

    /**
     * 写入一条操作日志.
     *
     * @param req 日志内容
     * @return 成功
     */
    @PostMapping
    public Result<Void> create(@RequestBody OperationLogReq req) {
        OperationLog log = new OperationLog();
        log.setUserId(req.getUserId());
        log.setMethod(req.getMethod());
        log.setPath(req.getPath());
        log.setQuery(req.getQuery());
        log.setBody(req.getBody());
        log.setStatusCode(req.getStatusCode());
        log.setIp(req.getIp());
        log.setDurationMs(req.getDurationMs());
        log.setUserAgent(req.getUserAgent());
        log.setErrorMessage(req.getErrorMessage());
        service.save(log);
        return Result.success(null);
    }

    /**
     * 分页查询操作日志.
     *
     * @param method  方法过滤（可选，ALL/空表示不限）
     * @param path    路径模糊（可选）
     * @param userIds 用户集合（可选，重复参数或逗号分隔）
     * @param page    页码
     * @param pageSize 每页大小
     * @return 分页结果
     */
    @GetMapping
    public Result<OperationLogPage> list(
            @RequestParam(required = false) String method,
            @RequestParam(required = false) String path,
            @RequestParam(required = false) String username,
            @RequestParam(required = false) List<String> userIds,
            @RequestParam(required = false) Long startTime,
            @RequestParam(required = false) Long endTime,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        OperationLogQuery q = new OperationLogQuery();
        q.setMethod(method);
        q.setPath(path);
        q.setUsername(username);
        q.setUserIds(normalizeUserIds(userIds));
        q.setStartTime(startTime);
        q.setEndTime(endTime);
        q.setPage(page);
        q.setPageSize(pageSize);
        return Result.success(service.list(q));
    }

    private List<String> normalizeUserIds(List<String> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return userIds;
        }
        // 兼容单个逗号分隔串（如 "id1,id2"）
        if (userIds.size() == 1 && userIds.get(0) != null && userIds.get(0).contains(",")) {
            return List.of(userIds.get(0).split(","));
        }
        return userIds;
    }
}
