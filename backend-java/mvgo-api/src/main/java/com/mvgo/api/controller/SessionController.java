package com.mvgo.api.controller;

import java.util.Map;

import com.mvgo.business.service.SessionService;
import com.mvgo.common.Result;
import com.mvgo.data.entity.AiSessionDocument;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/sessions")
public class SessionController {

    private final SessionService service;

    public SessionController(SessionService service) { this.service = service; }

    @GetMapping
    public Result<?> findAll(@RequestParam("userId") String userId) {
        return Result.success(service.findAll(userId));
    }

    @GetMapping("{id}")
    public Result<AiSessionDocument> findById(@PathVariable String id) {
        return Result.success(service.findById(id));
    }

    @PostMapping
    public Result<AiSessionDocument> create(@RequestBody Map<String, Object> dto,
                                            @RequestParam("userId") String userId) {
        return Result.success(service.create(dto, userId));
    }

    @PostMapping("{id}")
    public Result<AiSessionDocument> update(@PathVariable String id, @RequestBody Map<String, Object> dto) {
        return Result.success(service.update(id, dto));
    }

    @PostMapping("{id}/delete")
    public Result<Void> delete(@PathVariable String id) {
        service.delete(id);
        return Result.success(null);
    }
}