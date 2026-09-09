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
import java.util.Date;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

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
            Map<String, Object> portalData = verifyViaPortal(token);
            if (portalData != null) {
                return Optional.of(upsertPortalUser(portalData));
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
