package com.mvgo.api.interceptor;

import com.mvgo.api.auth.AuthContext;
import com.mvgo.api.auth.PortalUser;
import com.mvgo.api.auth.SessionAuthService;
import com.mvgo.common.BizException;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Optional;

/**
 * 等价 Node {@code SessionGuard} 的 Spring 拦截器.
 *
 * <p>作用于 {@code /api/admin/**}，镜像 Node SessionGuard.canActivate 的可移植路径：
 * <ol>
 *   <li>{@code raw=1} 静态资源请求直接放行</li>
 *   <li>读取 {@code Token} 请求头，委托 {@link SessionAuthService} 校验门户 token / 开发兜底</li>
 *   <li>校验通过 → 写入请求属性（等价 Node 的 session.userId），放行</li>
 *   <li>校验失败 → 抛 {@link BizException}(401)，经 GlobalExceptionHandler 映射为
 *       {@code {success:false, code:401, ...}}（与 Node 401 形态一致）</li>
 * </ol>
 *
 * <p>注：Node SessionGuard 的第二条路径（express-session cookie userId）依赖 Node 私有会话存储，
 * 跨语言无法共享，Java 侧不实现；前端在同源/代理场景下始终携带 {@code Token} 头，
 * 拦截器走 Token 校验路径，prod 由前置网关把关时亦兼容透传。
 *
 * @since 1.0.0
 */
@Component
public class SessionGuardInterceptor implements HandlerInterceptor {

    private final SessionAuthService sessionAuthService;

    public SessionGuardInterceptor(SessionAuthService sessionAuthService) {
        this.sessionAuthService = sessionAuthService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        // 0. raw=1 静态资源放行（与 Node SessionGuard 一致）
        if ("1".equals(request.getParameter("raw"))) {
            return true;
        }
        // 1. Token header 校验（门户 token 或 dev 兜底）
        String token = request.getHeader("Token");
        Optional<PortalUser> user = sessionAuthService.authenticate(token);
        if (user.isEmpty()) {
            throw new BizException(401, "未登录或登录已过期");
        }
        PortalUser portalUser = user.get();
        request.setAttribute(AuthContext.ATTR_USER_ID, portalUser.uid());
        request.setAttribute(AuthContext.ATTR_USERNAME, portalUser.account());
        request.setAttribute(AuthContext.ATTR_PORTAL_USER, portalUser);
        return true;
    }
}
