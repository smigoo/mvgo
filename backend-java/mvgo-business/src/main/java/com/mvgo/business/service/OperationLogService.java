package com.mvgo.business.service;

import java.util.Calendar;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import com.mvgo.business.dto.OperationLogCleanupReq;
import com.mvgo.business.dto.OperationLogPage;
import com.mvgo.business.dto.OperationLogQuery;
import com.mvgo.business.dto.OperationLogVO;
import com.mvgo.common.BizException;
import com.mvgo.data.entity.OperationLog;
import com.mvgo.data.entity.UserDocument;
import com.mvgo.data.repository.OperationLogRepository;
import com.mvgo.data.repository.UserRepository;
import com.mongodb.client.result.DeleteResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * 操作日志业务服务.
 *
 * <p>写入由 Node 全局拦截器经 HTTP 上报；查询供管理后台只读使用。
 * 查询支持按方法 / 路径模糊 / 用户名 / 用户集合过滤，按 createdAt 倒序分页，并富化操作人。
 *
 * @since 1.0.0
 */
@Service
public class OperationLogService {

    private static final Logger log = LoggerFactory.getLogger(OperationLogService.class);

    /** 操作日志保留天数（超过该天数的旧日志由定时任务自动清理），可通过配置覆盖 */
    @Value("${operation.log.retention-days:90}")
    private int retentionDays;

    private final OperationLogRepository repository;

    private final MongoTemplate mongoTemplate;

    private final UserRepository userRepository;

    public OperationLogService(
            OperationLogRepository repository,
            MongoTemplate mongoTemplate,
            UserRepository userRepository) {
        this.repository = repository;
        this.mongoTemplate = mongoTemplate;
        this.userRepository = userRepository;
    }

    /** 写入一条操作日志（createdAt 为空时置当前时间） */
    public void save(OperationLog log) {
        if (log.getCreatedAt() == null) {
            log.setCreatedAt(new Date());
        }
        repository.save(log);
    }

    // ==================== 清理（手动删除 + 定时自动清理） ====================

    /**
     * 删除操作日志：ids 优先；否则按 beforeDays 清理旧日志；二者皆空则报错.
     *
     * @param req 清理请求（ids 或 beforeDays 二选一）
     * @return 实际删除条数
     */
    public int delete(OperationLogCleanupReq req) {
        if (req == null) {
            throw new BizException(400, "请求体不能为空");
        }
        List<String> ids = req.getIds();
        Integer beforeDays = req.getBeforeDays();
        if (ids != null && !ids.isEmpty()) {
            return deleteByIds(ids);
        }
        if (beforeDays != null && beforeDays > 0) {
            return deleteBefore(daysAgo(beforeDays));
        }
        throw new BizException(400, "ids 与 beforeDays 至少提供一个");
    }

    /** 按 id 批量删除（手动选择删除） */
    public int deleteByIds(List<String> ids) {
        Query query = new Query(Criteria.where("id").in(ids));
        DeleteResult result = mongoTemplate.remove(query, OperationLog.class);
        return (int) result.getDeletedCount();
    }

    /** 删除 createdAt 早于 threshold 的旧日志 */
    public int deleteBefore(Date threshold) {
        Query query = new Query(Criteria.where("createdAt").lt(threshold));
        DeleteResult result = mongoTemplate.remove(query, OperationLog.class);
        return (int) result.getDeletedCount();
    }

    /**
     * 定时自动清理：每天 03:00 删除超过保留天数的旧日志.
     *
     * <p>保留天数由 {@code operation.log.retention-days} 控制（默认 90）。
     * 任务自身吞掉异常并记日志，避免影响应用启动与调度线程。
     */
    @Scheduled(cron = "0 0 3 * * *")
    public void scheduledCleanup() {
        try {
            int deleted = deleteBefore(daysAgo(retentionDays));
            if (deleted > 0) {
                log.info("[OperationLog] 定时清理完成：删除 {} 条超过 {} 天的旧日志", deleted, retentionDays);
            }
        } catch (Exception e) {
            log.error("[OperationLog] 定时清理失败: {}", e.getMessage(), e);
        }
    }

    /** 计算 N 天前的零点时刻，作为清理阈值 */
    private Date daysAgo(int days) {
        Calendar cal = Calendar.getInstance();
        cal.add(Calendar.DAY_OF_MONTH, -days);
        return cal.getTime();
    }

    /** 分页查询操作日志，支持方法 / 路径 / 用户名 / 用户集合过滤，并富化操作人 */
    public OperationLogPage list(OperationLogQuery q) {
        int page = Math.max(q.getPage(), 1);
        int size = Math.min(Math.max(q.getPageSize(), 1), 100);

        Criteria criteria = new Criteria();
        if (q.getMethod() != null && !q.getMethod().isBlank() && !"ALL".equalsIgnoreCase(q.getMethod())) {
            criteria.and("method").is(q.getMethod().toUpperCase());
        }
        if (q.getPath() != null && !q.getPath().isBlank()) {
            criteria.and("path").regex(q.getPath(), "i");
        }
        // 用户名 → userId 集合（解析后按 userId 过滤）
        if (q.getUsername() != null && !q.getUsername().isBlank()) {
            List<UserDocument> matched = mongoTemplate.find(
                    new Query(Criteria.where("username").regex(q.getUsername(), "i")), UserDocument.class);
            List<String> ids = matched.stream().map(UserDocument::getId).collect(Collectors.toList());
            // 无匹配用户时强制空集（避免回退成「不限用户」）
            criteria.and("userId").in(ids.isEmpty() ? List.of("__no_match__") : ids);
        } else if (q.getUserIds() != null && !q.getUserIds().isEmpty()) {
            criteria.and("userId").in(q.getUserIds());
        }
        // 时间范围：createdAt ∈ [startTime, endTime]（epoch ms）
        if (q.getStartTime() != null || q.getEndTime() != null) {
            if (q.getStartTime() != null && q.getEndTime() != null) {
                criteria.and("createdAt")
                        .gte(new Date(q.getStartTime()))
                        .lte(new Date(q.getEndTime()));
            } else if (q.getStartTime() != null) {
                criteria.and("createdAt").gte(new Date(q.getStartTime()));
            } else {
                criteria.and("createdAt").lte(new Date(q.getEndTime()));
            }
        }

        Query query = new Query(criteria);
        long total = mongoTemplate.count(query, OperationLog.class);

        query.with(Sort.by(Sort.Direction.DESC, "createdAt"));
        query.skip((long) (page - 1) * size);
        query.limit(size);

        List<OperationLog> rows = mongoTemplate.find(query, OperationLog.class);

        Map<String, UserDocument> userMap = enrichUsers(rows);
        List<OperationLogVO> vos = rows.stream()
                .map(log -> toVO(log, userMap.get(log.getUserId())))
                .collect(Collectors.toList());

        OperationLogPage result = new OperationLogPage();
        result.setList(vos);
        result.setTotal(total);
        result.setPage(page);
        result.setPageSize(size);
        return result;
    }

    /** 批量查 users 集合，构建 userId → UserDocument 映射（供富化） */
    private Map<String, UserDocument> enrichUsers(List<OperationLog> rows) {
        Set<String> ids = rows.stream()
                .map(OperationLog::getUserId)
                .filter(id -> id != null && !id.isBlank())
                .collect(Collectors.toSet());
        if (ids.isEmpty()) {
            return Collections.emptyMap();
        }
        List<UserDocument> users = userRepository.findAllById(ids);
        Map<String, UserDocument> map = new HashMap<>(users.size());
        for (UserDocument u : users) {
            map.put(u.getId(), u);
        }
        return map;
    }

    /** 实体 → VO，绑定富化后的操作人（匿名则为 null） */
    private OperationLogVO toVO(OperationLog log, UserDocument user) {
        OperationLogVO vo = new OperationLogVO();
        vo.setId(log.getId());
        if (user != null) {
            OperationLogVO.OperationLogUser u = new OperationLogVO.OperationLogUser();
            u.setId(user.getId());
            u.setUsername(user.getUsername());
            u.setEmail(user.getEmail());
            u.setUid(user.getUid());
            vo.setUser(u);
        }
        vo.setMethod(log.getMethod());
        vo.setPath(log.getPath());
        vo.setQuery(log.getQuery());
        vo.setBody(log.getBody());
        vo.setStatusCode(log.getStatusCode());
        vo.setIp(log.getIp());
        vo.setDurationMs(log.getDurationMs());
        vo.setUserAgent(log.getUserAgent());
        vo.setErrorMessage(log.getErrorMessage());
        vo.setCreatedAt(log.getCreatedAt());
        return vo;
    }
}
