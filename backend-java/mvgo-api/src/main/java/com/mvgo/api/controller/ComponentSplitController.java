package com.mvgo.api.controller;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

import com.mvgo.api.dto.req.ComponentSplitAnalyzeReq;
import com.mvgo.api.dto.req.ComponentSplitBuildReq;
import com.mvgo.business.dto.ComponentSplitAnalyzeResult;
import com.mvgo.business.service.ComponentSplitService;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 组件拆分接口.
 *
 * <p>对齐「组件拆分」Skill: 分析需求文档 + HTML 原型输出组件列表, 并生成组件需求交付包.
 *
 * @since 1.0.0
 */
@RestController
@RequestMapping("/api/component-split")
public class ComponentSplitController {

    private final ComponentSplitService service;

    /**
     * 构造注入.
     *
     * @param service 组件拆分服务
     */
    public ComponentSplitController(ComponentSplitService service) {
        this.service = service;
    }

    /**
     * 分析需求文档 + HTML 原型, 返回组件列表.
     *
     * <p>响应体保持与 Node 后端一致的平铺结构 (前端 http.post 不做解包),
     * 失败场景由 GlobalExceptionHandler 以非 2xx 状态返回。
     *
     * @param req 请求
     * @return 组件列表
     */
    @PostMapping("/analyze")
    public ComponentSplitAnalyzeResult analyze(@RequestBody ComponentSplitAnalyzeReq req) {
        byte[] docx = decodeDocx(req.getDocxBase64());
        return service.analyze(docx, req.getHtmlContent());
    }

    /**
     * 生成组件需求交付包 (zip).
     *
     * @param req 请求
     * @return zip 字节流
     */
    @PostMapping("/build")
    public ResponseEntity<byte[]> build(@RequestBody ComponentSplitBuildReq req) {
        byte[] docx = decodeDocx(req.getDocxBase64());
        byte[] zip = service.build(docx, req.getHtmlContent(), req.getSelectedCodes());
        String fileName = "component-split-delivery.zip";
        ContentDisposition cd = ContentDisposition.attachment()
                .filename(fileName, StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, cd.toString())
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(zip);
    }

    private byte[] decodeDocx(String base64) {
        if (base64 == null || base64.isEmpty()) {
            return new byte[0];
        }
        String b64 = base64;
        int comma = b64.indexOf(',');
        if (comma >= 0) {
            b64 = b64.substring(comma + 1);
        }
        try {
            return Base64.getDecoder().decode(b64);
        } catch (IllegalArgumentException e) {
            throw new com.mvgo.common.BizException(
                    HttpStatus.BAD_REQUEST.value(), "docxBase64 解码失败: " + e.getMessage());
        }
    }
}
