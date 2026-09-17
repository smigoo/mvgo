package com.mvgo.api.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

/**
 * 门户 token 校验专用 HTTP 客户端.
 *
 * <p>独立配置类，避免与 {@link WebMvcConfig} 形成「配置类 → 拦截器 → 鉴权服务 → RestTemplate」循环依赖.
 *
 * @since 1.0.0
 */
@Configuration
public class RestClientConfig {

    /** 3s 连接超时 + 3s 读取超时，避免门户不可用时请求长时间 pending */
    @Bean
    @Primary
    public RestTemplate sessionGuardRestTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3000);
        factory.setReadTimeout(3000);
        return new RestTemplate(factory);
    }

    /**
     * 管理后台跨服务拉 Node usage-export（流式扫 tasks.json）用。
     * 独立 60s 读超时，禁止复用 sessionGuard 的 3s，否则 2000-cap 账本必超时。
     */
    @Bean
    public RestTemplate adminUsageExportRestTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5000);
        factory.setReadTimeout(60000);
        return new RestTemplate(factory);
    }
}
