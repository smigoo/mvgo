package com.mvgo.api.controller;

import java.util.Map;

import com.mvgo.business.service.DocumentService;
import com.mvgo.common.Result;
import com.mvgo.data.entity.DocDocument;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/documents")
public class DocumentController {

    private final DocumentService service;

    public DocumentController(DocumentService service) { this.service = service; }

    @PostMapping
    public Result<DocDocument> create(@RequestBody Map<String, Object> dto) {
        return Result.success(service.create(dto));
    }

    @GetMapping
    public Result<?> findAll(@RequestParam("groupId") String groupId) {
        return Result.success(service.findAll(groupId));
    }

    @GetMapping("{id}")
    public Result<DocDocument> findOne(@PathVariable String id) {
        return Result.success(service.findOne(id));
    }

    @PostMapping("{id}")
    public Result<DocDocument> update(@PathVariable String id, @RequestBody Map<String, Object> dto) {
        return Result.success(service.update(id, dto));
    }

    @PostMapping("{id}/delete")
    public Result<Void> delete(@PathVariable String id) {
        service.delete(id);
        return Result.success(null);
    }
}