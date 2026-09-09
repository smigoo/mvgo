package com.mvgo.api.controller;

import com.mvgo.business.service.SkillService;
import com.mvgo.common.Result;
import com.mvgo.data.entity.AiSkillDocument;

import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/skills")
public class SkillController {

    private final SkillService service;

    public SkillController(SkillService service) { this.service = service; }

    @GetMapping
    public Result<List<AiSkillDocument>> findAll() {
        return Result.success(service.findAll());
    }
}