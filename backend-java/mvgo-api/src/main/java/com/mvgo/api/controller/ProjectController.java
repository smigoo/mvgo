package com.mvgo.api.controller;

import java.util.Map;

import com.mvgo.business.service.ProjectService;
import com.mvgo.common.Result;
import com.mvgo.data.entity.AiProjectDocument;

import org.springframework.web.bind.annotation.*;

/**
 * 项目管理接口（迁自 Node projects.controller）.
 *
 * @since 1.0.0
 */
@RestController
@RequestMapping("/api/projects")
public class ProjectController {

    private final ProjectService projectService;

    public ProjectController(ProjectService projectService) {
        this.projectService = projectService;
    }

    @GetMapping
    public Result<?> findAll(@RequestParam("userId") String userId) {
        return Result.success(projectService.findAll(userId));
    }

    @GetMapping("{id}")
    public Result<AiProjectDocument> findById(
            @PathVariable String id,
            @RequestParam(value = "userId", required = false) String userId) {
        return Result.success(projectService.findById(id, userId));
    }

    @PostMapping
    public Result<AiProjectDocument> create(
            @RequestBody Map<String, Object> dto,
            @RequestParam("userId") String userId) {
        return Result.success(projectService.create(dto, userId));
    }

    @PostMapping("{id}")
    public Result<AiProjectDocument> update(
            @PathVariable String id,
            @RequestBody Map<String, Object> dto,
            @RequestParam(value = "userId", required = false) String userId) {
        return Result.success(projectService.update(id, dto, userId));
    }

    @PostMapping("{id}/delete")
    public Result<Void> archive(
            @PathVariable String id,
            @RequestParam(value = "userId", required = false) String userId) {
        projectService.archive(id, userId);
        return Result.success(null);
    }
}