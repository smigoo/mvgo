package com.mvgo.api.controller;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.util.Enumeration;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 剩余未迁移端点的 Node 反向代理.
 *
 * <p>覆盖前缀：component/tasks/config/apifox/screen-layout/chat/lite/page-generator/
 * microcode/workflows/token-usage/user/models. 这些端点或含 AI 调用/SSE 流/文件存储，
 * Java 暂不重写，通过字节级转发保持兼容.
 *
 * <p>已迁移端点的显式 Controller（Admin/Group/Project/Auth/Session/Skill/Document）优先级更高，
 * 不会被本代理拦截.
 *
 * @since 1.0.0
 */
@RestController
public class NodeProxyController {

    @Value("${mvgo.node.base-url:http://localhost:13030}")
    private String nodeBaseUrl;

    private static final String[] PROXY_PREFIXES = {
            "/api/component",
            "/api/tasks",
            "/api/config",
            "/api/apifox",
            "/api/screen-layout",
            "/api/chat",
            "/api/lite",
            "/api/page-generator",
            "/api/page-skeleton",
            "/api/microcode",
            "/api/workflows",
            "/api/token-usage",
            "/api/user",
            "/api/models",
            "/api/demo",
            "/api/preview",
            "/api/vue3",
            "/api/phase2",
            "/api/v2",
            "/api/progress"
    };

    @RequestMapping({
            "/api/component/**", "/api/tasks/**", "/api/config/**",
            "/api/apifox/**", "/api/screen-layout/**", "/api/chat/**",
            "/api/lite/**", "/api/page-generator/**", "/api/page-skeleton", "/api/page-skeleton/**",
            "/api/microcode/**",
            "/api/workflows/**", "/api/token-usage/**", "/api/user/**",
            "/api/models/**", "/api/demo/**", "/api/preview/**",
            "/api/vue3/**", "/api/phase2/**", "/api/v2/**",
            "/api/progress/**"
    })
    public void proxy(HttpServletRequest request, HttpServletResponse response) throws IOException {
        String path = request.getRequestURI();
        String query = request.getQueryString();
        // nodeBaseUrl 可能含 /api 后缀（如 http://localhost:13030/api），取纯 host:port
        String hostOnly = nodeBaseUrl.replaceAll("/api$", "").replaceAll("/$", "");
        String targetUrl = hostOnly + path + (query != null ? "?" + query : "");

        HttpURLConnection conn = (HttpURLConnection) new URL(targetUrl).openConnection();
        conn.setRequestMethod(request.getMethod());
        conn.setConnectTimeout(30000);
        conn.setReadTimeout(300000); // 5min for SSE/AI generation
        conn.setDoOutput(!"GET".equalsIgnoreCase(request.getMethod()) && !"HEAD".equalsIgnoreCase(request.getMethod()));

        // 转发请求头（排除 host/content-length）
        Enumeration<String> headerNames = request.getHeaderNames();
        while (headerNames.hasMoreElements()) {
            String name = headerNames.nextElement();
            if ("host".equalsIgnoreCase(name) || "content-length".equalsIgnoreCase(name)) continue;
            conn.setRequestProperty(name, request.getHeader(name));
        }

        // 转发请求体
        if (conn.getDoOutput()) {
            try (OutputStream os = conn.getOutputStream();
                 InputStream is = request.getInputStream()) {
                is.transferTo(os);
            }
        }

        conn.connect();

        // 转发响应状态和头
        response.setStatus(conn.getResponseCode());
        conn.getHeaderFields().forEach((key, values) -> {
            if (key != null && !"transfer-encoding".equalsIgnoreCase(key)) {
                values.forEach(v -> response.addHeader(key, v));
            }
        });

        // 转发响应体（支持 SSE 流式）
        try (InputStream is = conn.getResponseCode() < 400 ? conn.getInputStream() : conn.getErrorStream();
             OutputStream os = response.getOutputStream()) {
            if (is != null) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = is.read(buf)) != -1) {
                    os.write(buf, 0, n);
                    os.flush(); // immediate flush for SSE streaming
                }
            }
        }
    }
}