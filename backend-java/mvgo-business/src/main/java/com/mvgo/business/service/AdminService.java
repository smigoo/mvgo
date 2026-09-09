package com.mvgo.business.service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import com.mvgo.business.dto.AdminAiConfigVO;
import com.mvgo.business.dto.AdminComponentPage;
import com.mvgo.business.dto.AdminComponentVO;
import com.mvgo.business.dto.AdminUserPage;
import com.mvgo.business.dto.AdminDeleteUserResult;
import com.mvgo.business.dto.AdminUserVO;
import com.mvgo.common.BizException;
import com.mvgo.common.FieldCipher;
import com.mvgo.data.entity.ComponentDocument;
import com.mvgo.data.entity.UserAiConfigDocument;
import com.mvgo.data.entity.UserDocument;
import com.mvgo.data.repository.ComponentRepository;
import com.mvgo.data.repository.UserRepository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * 管理后台业务服务（迁自 Node AdminService）.
 *
 * <p>覆盖用户管理（列表 / 设置管理员 / 删除级联）与全量组件列表查询，
 * 直接读写与 Node 同一 MongoDB 库的 users / components 集合。
 *
 * <p>已知限制（本批次未迁移，仍由 Node 负责）：
 * <ul>
 *   <li>组/组成员、Git 凭证等关联集合的级联清理暂未实现；</li>
 *   <li>组件磁盘源文件删除需 Node 文件存储路径，本服务仅删除库内文档；</li>
 *   <li>用户 AI 配置读接口（listUserConfigs）已补齐，但写/删除仍由 Node 负责。</li>
 * </ul>
 *
 * @since 1.0.0
 */
@Service
public class AdminService {

    private static final Logger log = LoggerFactory.getLogger(AdminService.class);

    /** 密钥类字段：admin 视图中脱敏展示，不暴露明文（对齐 Node AdminService） */
    private static final List<String> SECRET_FIELDS = List.of(
            "textApiKey", "visionApiKey", "unifiedApiKey",
            "figmaToken", "apifoxToken");

    /** 非密钥但有价值的配置项：明文展示（对齐 Node AdminService） */
    private static final List<String> PLAIN_FIELDS = List.of(
            "textBaseURL", "textModel", "textProviderType", "textTemperature",
            "visionBaseURL", "visionModel", "visionProviderType", "visionTemperature",
            "unifiedBaseURL", "unifiedModel", "unifiedProviderType", "unifiedTemperature",
            "modelMode", "requestConcurrency", "requestQueueTimeoutMs",
            "requestTimeoutMs", "requestMaxRetries");

    private final UserRepository userRepository;
    private final ComponentRepository componentRepository;
    private final MongoTemplate mongoTemplate;
    private final FieldCipher fieldCipher;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** 跨服务拉取 Node user-stats 用（容器内唯一 RestTemplate：sessionGuardRestTemplate，3s 超时） */
    @Autowired
    private RestTemplate restTemplate;

    /** Node 后端地址（/api 前缀结尾），如 http://192.168.112.1:13030/api；本地默认 127.0.0.1 */
    @Value("${NODE_BACKEND_URL:http://127.0.0.1:13030/api}")
    private String nodeBackendUrl;

    /** 与 Node 端一致的内部统计 key（未配置则跳过统计拉取，列表字段为 0） */
    @Value("${ADMIN_STATS_KEY:}")
    private String adminStatsKey;

    public AdminService(
            UserRepository userRepository,
            ComponentRepository componentRepository,
            MongoTemplate mongoTemplate,
            @Value("${FIELD_ENCRYPTION_KEY:}") String encryptionKey) {
        this.userRepository = userRepository;
        this.componentRepository = componentRepository;
        this.mongoTemplate = mongoTemplate;
        this.fieldCipher = new FieldCipher(encryptionKey);
        if (encryptionKey == null || encryptionKey.isBlank()) {
            log.warn("[AdminService] 未配置 FIELD_ENCRYPTION_KEY，使用开发派生密钥解密；"
                    + "生产环境将无法解密 user_ai_configs.configEnc，请注入与 Node 相同的 key");
        }
    }

    /** 所有用户列表（按用户名升序），字段对齐 Node listUsers 输出 */
    public AdminUserPage listUsers() {
        List<UserDocument> users = userRepository.findAll();

        // 读取 user_ai_configs 全量并按 userId 建索引，供 hasConfig / config 填充。
        // 对齐 Node AdminService.listUsers()：有配置记录 → hasConfig=true，并携带
        // config{secrets: 脱敏, plain: 明文} 供前端「配置状态」标签与「查看配置」抽屉渲染。
        List<UserAiConfigDocument> configDocs = mongoTemplate.findAll(UserAiConfigDocument.class);
        Map<String, UserAiConfigDocument> configMap = new java.util.HashMap<>(Math.max(configDocs.size() * 2, 16));
        for (UserAiConfigDocument d : configDocs) {
            String cfgUserId = d.getUserId();
            if (cfgUserId != null && !cfgUserId.isBlank()) {
                configMap.put(cfgUserId, d);
            }
        }

        // 生成统计（组件数/任务数/接口数）：task 与 apifox 台账只存 Node data 目录，
        // Java 无法直查 → 跨服务拉一次 Node /api/admin/user-stats（带内部 key）。
        // Node 不可达 / 未配置 key 时静默降级，统计字段为 0，不影响列表返回。
        Map<String, int[]> statsMap = fetchUserStats();

        List<AdminUserVO> list = users.stream()
                .map(u -> toUserVO(u, configMap.get(u.getId()), statsMap))
                .sorted((a, b) -> (a.getUsername() == null ? "" : a.getUsername())
                        .compareTo(b.getUsername() == null ? "" : b.getUsername()))
                .collect(Collectors.toList());
        return new AdminUserPage(list, list.size());
    }

    /**
     * 拉取 Node user-stats（全量 { userId → [componentCount, taskCount, apiTaskCount, apiCount] }）。
     * 任何失败返回空 Map（调用方降级为 0）。
     */
    private Map<String, int[]> fetchUserStats() {
        if (nodeBackendUrl == null || nodeBackendUrl.isBlank()
                || adminStatsKey == null || adminStatsKey.isBlank()) {
            return java.util.Collections.emptyMap();
        }
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("x-admin-stats-key", adminStatsKey);
            HttpEntity<Void> entity = new HttpEntity<>(headers);
            String url = nodeBackendUrl.endsWith("/")
                    ? nodeBackendUrl + "admin/user-stats"
                    : nodeBackendUrl + "/admin/user-stats";
            ResponseEntity<Map> resp = restTemplate.exchange(url, HttpMethod.GET, entity, Map.class);
            Map body = resp.getBody();
            if (body == null || !Boolean.TRUE.equals(body.get("success"))) {
                return java.util.Collections.emptyMap();
            }
            Object data = body.get("data");
            if (!(data instanceof Map)) {
                return java.util.Collections.emptyMap();
            }
            Map<String, Object> all = (Map<String, Object>) data;
            Map<String, int[]> out = new java.util.HashMap<>(Math.max(all.size() * 2, 16));
            for (Map.Entry<String, Object> e : all.entrySet()) {
                if (!(e.getValue() instanceof Map)) continue;
                Map<?, ?> m = (Map<?, ?>) e.getValue();
                out.put(e.getKey(), new int[]{
                        intVal(m.get("componentCount")), intVal(m.get("taskCount")),
                        intVal(m.get("apiTaskCount")), intVal(m.get("apiCount"))});
            }
            return out;
        } catch (Exception ex) {
            log.warn("[AdminService] 拉取 Node user-stats 失败（统计降级为 0）: {}", ex.getMessage());
            return java.util.Collections.emptyMap();
        }
    }

    private static int intVal(Object o) {
        return o instanceof Number ? ((Number) o).intValue() : 0;
    }

    /** 动态设置用户管理员标志 */
    public void setUserAdmin(String id, boolean isAdmin) {
        UpdateResultHolder r = doUpdateUser(id, new Update().set("isAdmin", isAdmin));
        if (r.matched == 0) {
            throw new BizException(404, "用户不存在");
        }
    }

    /**
     * 删除用户及其创建的组件（级联清理，部分限制见类注释）。
     *
     * @return 删除统计
     */
    public AdminDeleteUserResult deleteUser(String operatorId, String targetId) {
        if (operatorId != null && operatorId.equals(targetId)) {
            throw new BizException(400, "不能删除自己的账号");
        }

        UserDocument target = userRepository.findById(targetId).orElse(null);
        if (target == null) {
            throw new BizException(404, "目标用户不存在");
        }

        // 禁止删除最后一个管理员
        long adminCount = mongoTemplate.count(
                new Query(Criteria.where("isAdmin").is(true)), UserDocument.class);
        if (adminCount <= 1 && Boolean.TRUE.equals(target.getIsAdmin())) {
            throw new BizException(400, "不能删除唯一的管理员账号");
        }

        List<String> cleaned = new ArrayList<>();
        int deletedComponents = 0;

        // 1. 删除该用户创建的所有组件（库内文档）
        List<ComponentDocument> owned = mongoTemplate.find(
                new Query(Criteria.where("creatorId").is(targetId)), ComponentDocument.class);
        if (!owned.isEmpty()) {
            componentRepository.deleteAll(owned);
            deletedComponents = owned.size();
            cleaned.add("components(" + deletedComponents + ")");
        }

        // 2. 删除用户文档
        userRepository.deleteById(targetId);
        cleaned.add("users");

        AdminDeleteUserResult result = new AdminDeleteUserResult();
        result.setDeletedComponents(deletedComponents);
        result.setCleanedCollections(cleaned);
        return result;
    }

    /** 全量组件列表（越过 groupId/creatorId 过滤），支持搜索 / 分页 */
    public AdminComponentPage listComponents(
            String search, String sortBy, int page, int pageSize) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(pageSize, 1), 60);

        Criteria criteria = new Criteria();
        if (search != null && !search.isBlank()) {
            criteria.and("name").regex(search, "i");
        }
        Query query = new Query(criteria);

        long total = mongoTemplate.count(query, ComponentDocument.class);

        Sort.Direction dir = Sort.Direction.DESC;
        String field = "updatedAt";
        if ("created".equals(sortBy)) {
            field = "createdAt";
        } else if ("name".equals(sortBy)) {
            dir = Sort.Direction.ASC;
            field = "name";
        }
        query.with(Sort.by(dir, field));
        query.skip((long) (safePage - 1) * safeSize);
        query.limit(safeSize);

        List<ComponentDocument> rows = mongoTemplate.find(query, ComponentDocument.class);

        // 富化创建者
        Map<String, UserDocument> userMap = enrichCreators(rows);
        List<AdminComponentVO> vos = rows.stream()
                .map(c -> toComponentVO(c, userMap.get(c.getCreatorId())))
                .collect(Collectors.toList());

        AdminComponentPage result = new AdminComponentPage();
        result.setList(vos);
        result.setTotal(total);
        result.setPage(safePage);
        result.setPageSize(safeSize);
        return result;
    }

    /**
     * 聚合所有用户的 AI 配置（密钥脱敏），按用户名升序。
     *
     * <p>口径对齐 Node {@code AdminService.listUserConfigs()}：
     * <ul>
     *   <li>读取 user_ai_configs 全量，configEnc 经 FIELD_ENCRYPTION_KEY 解密为明文对象；</li>
     *   <li>密钥字段（apiKey/token）脱敏入 {@code secrets}，模型等非密钥字段明文入 {@code plain}；</li>
     *   <li>解密失败（缺 key / GCM 认证不过 / 数据损坏）时该用户 config 为空对象，不影响列表返回。</li>
     * </ul>
     */
    public List<AdminAiConfigVO> listUserConfigs() {
        List<UserAiConfigDocument> docs = mongoTemplate.findAll(UserAiConfigDocument.class);
        if (docs.isEmpty()) {
            return new ArrayList<>();
        }

        List<String> userIds = docs.stream()
                .map(UserAiConfigDocument::getUserId)
                .filter(id -> id != null && !id.isBlank())
                .distinct()
                .collect(Collectors.toList());
        Map<String, UserDocument> userMap = enrichUsers(userIds);

        return docs.stream()
                .map(d -> toAiConfigVO(d, userMap.get(d.getUserId())))
                .sorted((a, b) -> nullSafe(a.getUsername()).compareTo(nullSafe(b.getUsername())))
                .collect(Collectors.toList());
    }

    private Map<String, UserDocument> enrichUsers(List<String> ids) {
        if (ids.isEmpty()) {
            return Collections.emptyMap();
        }
        List<UserDocument> users = userRepository.findAllById(ids);
        Map<String, UserDocument> map = new java.util.HashMap<>(users.size());
        for (UserDocument u : users) {
            map.put(u.getId(), u);
        }
        return map;
    }

    private AdminAiConfigVO toAiConfigVO(UserAiConfigDocument doc, UserDocument user) {
        AdminAiConfigVO vo = new AdminAiConfigVO();
        vo.setUserId(doc.getUserId());
        if (user != null) {
            vo.setUsername(user.getUsername());
            String displayName = user.getUsername();
            Map<String, Object> portal = user.getPortalInfo();
            if (portal != null) {
                String portalName = asString(portal.get("name"));
                if (portalName != null && !portalName.isBlank()) {
                    displayName = portalName;
                }
                String portalUid = asString(portal.get("uid"));
                vo.setUid(portalUid != null ? portalUid : "");
            }
            vo.setDisplayName(displayName);
        } else {
            String fallback = doc.getUserId();
            vo.setUsername(fallback);
            vo.setDisplayName(fallback);
            vo.setUid("");
        }
        vo.setUpdatedAt(doc.getUpdatedAt());
        vo.setConfig(decryptAndMask(doc.getConfigEnc()));
        return vo;
    }

    /** 解密 configEnc → { secrets: 掩码, plain: 明文 }；任何失败降级为空对象 */
    private Map<String, Object> decryptAndMask(String configEnc) {
        Map<String, Object> view = new LinkedHashMap<>();
        Map<String, String> secrets = new LinkedHashMap<>();
        Map<String, Object> plain = new LinkedHashMap<>();
        view.put("secrets", secrets);
        view.put("plain", plain);

        String json = fieldCipher.decrypt(configEnc);
        if (json == null) {
            return view;
        }
        Map<String, Object> cfg;
        try {
            cfg = objectMapper.readValue(json, new TypeReference<Map<String, Object>>() { });
        } catch (Exception e) {
            log.debug("[AdminService] user_ai_configs 配置 JSON 解析失败: {}", e.getMessage());
            return view;
        }

        for (String f : SECRET_FIELDS) {
            Object v = cfg.get(f);
            if (v instanceof String && !((String) v).isBlank()) {
                secrets.put(f, maskSecret((String) v));
            }
        }
        for (String f : PLAIN_FIELDS) {
            Object v = cfg.get(f);
            if (v != null && !(v instanceof String && ((String) v).isEmpty())) {
                plain.put(f, v);
            }
        }
        return view;
    }

    private static String maskSecret(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String v = value.trim();
        if (v.length() <= 8) {
            return "****";
        }
        return v.substring(0, 6) + "****" + v.substring(v.length() - 4);
    }

    private static String nullSafe(String s) {
        return s == null ? "" : s;
    }

    private UpdateResultHolder doUpdateUser(String id, Update update) {
        com.mongodb.client.result.UpdateResult updateResult =
                mongoTemplate.updateFirst(new Query(Criteria.where("id").is(id)), update, UserDocument.class);
        return new UpdateResultHolder((int) updateResult.getMatchedCount());
    }

    private Map<String, UserDocument> enrichCreators(List<ComponentDocument> rows) {
        List<String> ids = rows.stream()
                .map(ComponentDocument::getCreatorId)
                .filter(id -> id != null && !id.isBlank())
                .distinct()
                .collect(Collectors.toList());
        if (ids.isEmpty()) {
            return Collections.emptyMap();
        }
        List<UserDocument> users = userRepository.findAllById(ids);
        Map<String, UserDocument> map = new java.util.HashMap<>(users.size());
        for (UserDocument u : users) {
            map.put(u.getId(), u);
        }
        return map;
    }

    private AdminUserVO toUserVO(UserDocument u, UserAiConfigDocument cfg, Map<String, int[]> statsMap) {
        AdminUserVO vo = new AdminUserVO();
        vo.setId(u.getId());
        vo.setUid(u.getUid());
        vo.setUsername(u.getUsername());
        Map<String, Object> portal = u.getPortalInfo();
        String portalUid = portal != null ? asString(portal.get("uid")) : null;
        String name = portal != null ? asString(portal.get("name")) : null;
        vo.setName(name != null && !name.isBlank() ? name : u.getUsername());
        vo.setFullName(portal != null ? asString(portal.get("fullName")) : null);
        vo.setDeptName(portal != null ? asString(portal.get("deptName")) : null);
        vo.setOrgName(portal != null ? asString(portal.get("orgName")) : null);
        vo.setSource(portalUid != null && !portalUid.isBlank() ? "qs" : "local");
        vo.setIsAdmin(Boolean.TRUE.equals(u.getIsAdmin()));
        // 对齐 Node：存在 user_ai_configs 记录即 hasConfig=true；config 为解密脱敏视图
        //（secrets 掩码 / plain 明文），无记录则 null（前端抽屉据此显示「尚未配置」）。
        vo.setHasConfig(cfg != null);
        vo.setConfig(cfg != null ? decryptAndMask(cfg.getConfigEnc()) : null);
        // 生成统计（组件数/任务数/接口数）；无 Node 统计时保持 0
        int[] st = statsMap.get(u.getId());
        if (st != null) {
            vo.setComponentCount(st[0]);
            vo.setTaskCount(st[1]);
            vo.setApiTaskCount(st[2]);
            vo.setApiCount(st[3]);
        }
        vo.setCreatedAt(u.getCreatedAt());
        vo.setUpdatedAt(u.getUpdatedAt());
        return vo;
    }

    private AdminComponentVO toComponentVO(ComponentDocument c, UserDocument creator) {
        AdminComponentVO vo = new AdminComponentVO();
        vo.setId(c.getId());
        vo.setComponentId(c.getComponentId());
        vo.setTaskId(c.getTaskId());
        vo.setTarget(c.getTarget());
        vo.setName(c.getName());
        vo.setDescription(c.getDescription());
        vo.setCreatorId(c.getCreatorId());
        vo.setGroupId(c.getGroupId());
        vo.setMetadata(c.getMetadata());
        vo.setCreatedAt(c.getCreatedAt());
        vo.setUpdatedAt(c.getUpdatedAt());
        if (creator != null) {
            AdminComponentVO.Creator cr = new AdminComponentVO.Creator();
            cr.setId(creator.getId());
            cr.setUsername(creator.getUsername());
            cr.setEmail(creator.getEmail());
            vo.setCreator(cr);
        }
        return vo;
    }

    private static String asString(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    /** 小工具类：承载 MongoWriteResult 的 matchedCount */
    private static class UpdateResultHolder {
        final int matched;

        UpdateResultHolder(int matched) {
            this.matched = matched;
        }
    }
}
