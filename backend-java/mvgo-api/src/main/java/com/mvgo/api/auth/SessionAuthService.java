package com.mvgo.api.auth;

import com.mvgo.business.service.GroupService;
import com.mvgo.business.util.PasswordUtil;
import com.mvgo.common.BizException;
import com.mvgo.data.entity.UserDocument;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Date;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 会话鉴权服务 —— 等价 Node {@code SessionGuard} 的「Token header 兜底」逻辑.
 *
 * <p>Node SessionGuard 有三条放行路径：
 * <ol>
 *   <li>{@code raw=1} 静态资源放行（由拦截器处理）</li>
 *   <li>{@code session.userId} 已登录放行（依赖 express-session cookie，
 *       跨语言无法共享存储，Java 侧不实现此路径）</li>
 *   <li>{@code Token} header 校验门户 token / 开发兜底（本服务实现）</li>
 * </ol>
 *
 * <p>门户 token 校验成功后会<b>幂等 upsert 本地 users 集合</b>并确保私人工作空间，
 * 等价 Node {@code AuthService.findOrCreateByPortalToken} 行为，
 * 避免全新门户用户首次扫码进系统报 401 "用户不存在" + 前端死循环回跳。
 *
 * <p>安全红线（fail-closed）：
 * <ul>
 *   <li>{@code PORTAL_BASE_URL} 未配置 → 门户校验直接返回空（绝不接受伪造身份）</li>
 *   <li>门户响应 {@code code !== 200} 或缺少 {@code data.uid/account} → 返回空</li>
 *   <li>任何网络/解析异常 → 返回空</li>
 *   <li>开发兜底仅当 {@code DEV_AUTO_LOGIN=true} 且非 prod profile 时生效；
 *       prod profile 下强制禁用，绝不接受开发/伪造 token</li>
 * </ul>
 *
 * @since 1.0.0
 */
@Service
public class SessionAuthService {

    private static final Logger logger = LoggerFactory.getLogger(SessionAuthService.class);

    private final RestTemplate restTemplate;
    private final Environment environment;
    private final MongoTemplate mongoTemplate;
    private final GroupService groupService;

    /** 门户登录校验基地址，绑定环境变量 PORTAL_BASE_URL */
    @Value("${PORTAL_BASE_URL:}")
    private String portalBaseUrl;

    /** 开发态自动登录开关，绑定环境变量 DEV_AUTO_LOGIN */
    @Value("${DEV_AUTO_LOGIN:false}")
    private boolean devAutoLogin;

    // 🛡️ 2026-09-29 门户校验结果短 TTL 缓存：
    // 此前每个请求都实时 HTTP 调门户 getTokenUser —— 门户 token 有效期短，
    // token 到期/门户抖动瞬间 Java 全线 401（Node 侧有 session 不受影响，
    // 表现为「一半功能突然要登录」），且每请求一次门户调用，性能与门户压力双输。
    // 现将「token 摘要 → 门户用户」缓存 5 分钟；到期后自然回落实时校验，
    // fail-closed 语义不变：仅缓存校验成功的结果，失败绝不缓存。
    private static final long PORTAL_CACHE_TTL_MS = 5 * 60 * 1000L;
    private static final int PORTAL_CACHE_MAX_ENTRIES = 1024;

    /** 缓存条目：门户用户 + 过期时间戳 */
    private record CachedPortalUser(PortalUser user, long expireAtMs) {}

    private final ConcurrentHashMap<String, CachedPortalUser> portalCache = new ConcurrentHashMap<>();

    @Autowired
    public SessionAuthService(RestTemplate restTemplate, Environment environment,
                              MongoTemplate mongoTemplate, GroupService groupService) {
        this.restTemplate = restTemplate;
        this.environment = environment;
        this.mongoTemplate = mongoTemplate;
        this.groupService = groupService;
    }

    /**
     * 校验请求携带的门户 token.
     *
     * @param token 请求头 Token 值（可能为 null）
     * @return 解析出的门户用户；校验不通过返回 empty
     */
    public Optional<PortalUser> authenticate(String token) {
        if (token != null && !token.isBlank()) {
            // 1. 短 TTL 缓存命中（key=token 摘要，不落明文）直接放行，免门户调用
            PortalUser cached = getCachedPortalUser(token);
            if (cached != null) {
                return Optional.of(cached);
            }
            // 2. 未命中 → 实时校验门户，成功后写缓存
            Map<String, Object> portalData = verifyViaPortal(token);
            if (portalData != null) {
                PortalUser user = upsertPortalUser(portalData);
                putCachedPortalUser(token, user);
                return Optional.of(user);
            }
        }
        // 开发态自动登录：DEV_AUTO_LOGIN=true 且非 prod 时，无 token / 门户校验失败均兜底 dev-local
        if (devAutoLogin && !isProdProfile()) {
            return Optional.of(new PortalUser("dev-local", "dev-local", "dev-local"));
        }
        return Optional.empty();
    }

    private boolean isProdProfile() {
        return environment.acceptsProfiles(org.springframework.core.env.Profiles.of("prod"));
    }

    /** 取缓存（过期惰性剔除） */
    private PortalUser getCachedPortalUser(String token) {
        String key = tokenDigestKey(token);
        CachedPortalUser entry = portalCache.get(key);
        if (entry == null) {
            return null;
        }
        if (System.currentTimeMillis() > entry.expireAtMs()) {
            portalCache.remove(key);
            return null;
        }
        return entry.user();
    }

    /** 写缓存（带简单容量保护：超限时惰性清理过期项；异常不影响鉴权主流程） */
    private void putCachedPortalUser(String token, PortalUser user) {
        try {
            if (portalCache.size() >= PORTAL_CACHE_MAX_ENTRIES) {
                long now = System.currentTimeMillis();
                portalCache.entrySet().removeIf(e -> now > e.getValue().expireAtMs());
            }
            portalCache.put(tokenDigestKey(token),
                    new CachedPortalUser(user, System.currentTimeMillis() + PORTAL_CACHE_TTL_MS));
        } catch (Exception e) {
            logger.warn("门户校验缓存写入失败（不影响鉴权）: {}", e.getMessage());
        }
    }

    /** token 摘要（SHA-256）作缓存 key，避免明文 token 驻留内存 */
    private String tokenDigestKey(String token) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(token.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            // 摘要不可用时退化为直接以 token 为 key（功能不变）
            return token;
        }
    }

    /**
     * 调门户 getTokenUser 校验 token 并返回门户返回的 data 字段.
     * 失败 / 未配置 / 网络异常一律返回 null（fail-closed）.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> verifyViaPortal(String token) {
        if (portalBaseUrl == null || portalBaseUrl.isBlank()) {
            return null; // fail-closed：未配置门户地址，禁用自动登录
        }
        String base = portalBaseUrl.endsWith("/")
                ? portalBaseUrl.substring(0, portalBaseUrl.length() - 1)
                : portalBaseUrl;
        String url = base + "/getTokenUser?token=" + URLEncoder.encode(token, StandardCharsets.UTF_8);
        try {
            ResponseEntity<Map> resp = restTemplate.getForEntity(url, Map.class);
            Map<String, Object> body = resp.getBody();
            if (body == null || !Integer.valueOf(200).equals(body.get("code"))) {
                return null;
            }
            Object dataObj = body.get("data");
            if (!(dataObj instanceof Map)) {
                return null;
            }
            return (Map<String, Object>) dataObj;
        } catch (Exception e) {
            return null; // fail-closed
        }
    }

    /**
     * 幂等 upsert 门户用户到本地 users 集合，并确保私人工作空间 + admin 成员.
     * 等价 Node {@code AuthService.findOrCreateByPortalToken} + {@code ensureUserPrivateGroup}.
     *
     * <p>查找顺序：先按 uid，再按 username（兼容软删除旧用户恢复）.
     * 新建时 password 写随机 PBKDF2 哈希（门户用户不走密码登录），
     * portalInfo 始终刷新为本次门户返回的最新快照.
     */
    private PortalUser upsertPortalUser(Map<String, Object> data) {
        String uid = String.valueOf(data.get("uid"));
        String account = String.valueOf(data.get("account"));
        Object nameObj = data.get("name");
        String displayName = nameObj == null ? account : String.valueOf(nameObj);

        Date now = new Date();
        // 门户用户不走密码登录，password 仅为占位；hash 极端失败回落随机字串（不影响主流程）
        String randomPw;
        try {
            randomPw = PasswordUtil.hash(UUID.randomUUID().toString());
        } catch (Exception ex) {
            logger.warn("PasswordUtil.hash 失败，回落占位 password: {}", ex.getMessage());
            randomPw = "{java-pbkdf2}$" + UUID.randomUUID().toString();
        }
        Query uq = new Query(new Criteria().orOperator(
                Criteria.where("uid").is(uid),
                Criteria.where("username").is(account)
        ));
        Update uu = new Update()
                .set("uid", uid)
                .set("portalInfo", data)
                .set("updatedAt", now)
                .setOnInsert("username", account)
                .setOnInsert("password", randomPw)
                .setOnInsert("createdAt", now);
        UserDocument user = mongoTemplate.findAndModify(
                uq, uu,
                FindAndModifyOptions.options().upsert(true).returnNew(true),
                UserDocument.class);
        if (user == null) {
            // 极端并发 upsert 偶发返 null，回退 findOne
            user = mongoTemplate.findOne(uq, UserDocument.class);
        }
        if (user == null) {
            // 不应发生；fail-soft：仍返回 PortalUser，下游 current() 查不到会 401，但不至于系统崩溃
            logger.warn("门户用户 upsert 异常: uid={} account={}", uid, account);
            return new PortalUser(uid, account, displayName);
        }

        // 确保私人工作空间（幂等，自身有 logger）
        try {
            groupService.ensureUserPrivateGroup(uid, user.getId(), displayName);
        } catch (Exception e) {
            // 私人组建失败不阻塞主流程（current() 会回退 default role=member）
            logger.warn("门户用户私人工作空间创建失败: uid={}, err={}", uid, e.getMessage());
        }

        return new PortalUser(uid, account, displayName);
    }
}
