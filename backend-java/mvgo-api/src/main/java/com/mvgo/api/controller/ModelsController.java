package com.mvgo.api.controller;

import java.util.List;
import java.util.Map;

import com.mvgo.common.Result;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * AI 模型列表接口（迁自 Node models.controller）.
 * 当前为硬编码列表，后续可从 DB/配置读取.
 */
@RestController
@RequestMapping("/api/models")
public class ModelsController {

    private static final List<Map<String, String>> AVAILABLE_MODELS = List.of(
            Map.of("value", "claude-sonnet-4-6", "label", "Claude Sonnet 4 (推荐)"),
            Map.of("value", "claude-opus-4", "label", "Claude Opus 4"),
            Map.of("value", "claude-haiku-4", "label", "Claude Haiku 4"),
            Map.of("value", "gpt-4o", "label", "GPT-4o"),
            Map.of("value", "gpt-4o-mini", "label", "GPT-4o Mini"),
            Map.of("value", "deepseek-v3", "label", "DeepSeek V3"),
            Map.of("value", "gemini-2.5-pro", "label", "Gemini 2.5 Pro")
    );

    @GetMapping
    public Result<List<Map<String, String>>> getModels() {
        return Result.success(AVAILABLE_MODELS);
    }
}