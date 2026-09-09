package com.mvgo.api.controller;

import com.mvgo.common.Result;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 探活接口.
 *
 * @since 1.0.0
 */
@RestController
@RequestMapping("/api")
public class HealthController {

    /**
     * 服务探活.
     *
     * @return 固定成功响应
     */
    @GetMapping("/health")
    public Result<String> health() {
        return Result.success("ok");
    }
}
