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
 * <p>覆盖前缀以下方 {@code @RequestMapping} 为唯一事实源（数组常量已删除，避免漂移）。
 * 这些端点或含 AI 调用/SSE 流/文件存储，Java 暂不重写，通过字节级转发保持兼容.
 *
 * <p>已迁移端点的显式 Controller（Admin/Group/Project/Auth/Session/Skill/Document）优先级更高，
 * 不会被本代理拦截.
 *
 * <p>🔴 与 Nginx 的关系（两层独立开关）：生产真实分流发生在 Nginx
 * {@code /etc/nginx/vhost/gzxj.conf} —— 其中「Node 13030 路由」白名单 location
 * 排在兜底 {@code location /api}（→ 本服务 8080）之前。落到本类的请求才会走这里的
 * 转发清单。<b>新增 Node 模块必须同时改 Nginx location 与本类 {@code @RequestMapping}，
 * 否则新接口在生产返回 500（Java 无该路由）。</b>
 *
 * @since 1.0.0
 */
@RestController
public class NodeProxyController {

    @Value("${mvgo.node.base-url:http://localhost:13030}")
    private String nodeBaseUrl;

    /**
     * ⚠️ 2026-11-06 清理：此处原先有一份 {@code PROXY_PREFIXES} 常量数组，
     * 全仓仅出现在声明处、无任何引用 = 死代码，且已与下面的 {@code @RequestMapping}
     * 漂移（数组少 {@code /api/page-skeleton}）。Spring 注解只接受编译期字面量，
     * 无法与数组共用，故删掉数组 —— <b>{@code @RequestMapping} 是本类唯一生效的路由清单</b>。
     * 新增 Node 模块时必须改这里，并在 docs/DEPLOYMENT-NOTES.md 的
     * 「Node 13030 路由」表同步 Nginx location（Nginx 是第一道分流，本类是兜底）。
     */
    @RequestMapping({
            "/api/component/**", "/api/tasks/**", "/api/config/**",
            "/api/apifox/**", "/api/screen-layout/**", "/api/chat/**",
            "/api/lite/**", "/api/page-generator/**", "/api/page-skeleton", "/api/page-skeleton/**",
            "/api/microcode/**",
            "/api/workflows/**", "/api/token-usage/**", "/api/user/**",
            "/api/models/**", "/api/demo/**", "/api/preview/**",
            "/api/vue3/**", "/api/phase2/**", "/api/v2/**",
            "/api/progress/**",
            "/api/mc-spec", "/api/mc-spec/**",
            // 🔴 2026-11-06 补齐此前缺失的 8 个 Node 前缀（生产实测：
            //   /api/meeting-asr/status 与 /api/v3/project/health 落到 Java 返回 500，
            //   因为 Nginx 与 Java 两级白名单都没有它们 —— 兜底路径也必须能转发）
            "/api/announcements/**", "/api/workbench/**", "/api/task-stats/**",
            "/api/meeting-asr/**", "/api/v3/**", "/api/lite-lab/**",
            "/api/agent-builder/**", "/api/recipes/**"
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