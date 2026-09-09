package com.mvgo.api.config;

import com.mvgo.api.interceptor.AdminInterceptor;
import com.mvgo.api.interceptor.SessionGuardInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Web MVC 配置：注册 SessionGuard + AdminInterceptor 拦截器.
 *
 * <p>门户校验用 RestTemplate 见 {@link RestClientConfig}（独立配置类，避免循环依赖）.
 *
 * @since 1.0.0
 */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    private final SessionGuardInterceptor sessionGuardInterceptor;
    private final AdminInterceptor adminInterceptor;

    public WebMvcConfig(SessionGuardInterceptor sessionGuardInterceptor,
                        AdminInterceptor adminInterceptor) {
        this.sessionGuardInterceptor = sessionGuardInterceptor;
        this.adminInterceptor = adminInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // 1) 登录态校验：所有受保护接口
        registry.addInterceptor(sessionGuardInterceptor)
                .addPathPatterns("/api/admin/**", "/api/auth/**", "/api/group/**", "/api/projects/**", "/api/sessions/**", "/api/skills/**", "/api/documents/**")
                .excludePathPatterns("/api/auth/register", "/api/auth/login", "/api/auth/logout", "/api/auth/change-password");

        // 2) 管理员鉴权：紧接 SessionGuard 之后，仅对 /api/admin/** 强制 isAdmin 校验
        registry.addInterceptor(adminInterceptor)
                .addPathPatterns("/api/admin/**");
    }
}
