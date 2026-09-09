package com.mvgo.business.service;

import java.util.Date;
import java.util.Map;

import com.mvgo.common.BizException;
import com.mvgo.data.entity.DocDocument;
import com.mvgo.data.repository.DocRepository;

import org.springframework.stereotype.Service;

@Service
public class DocumentService {

    private final DocRepository docRepo;

    public DocumentService(DocRepository docRepo) { this.docRepo = docRepo; }

    public DocDocument create(Map<String, Object> dto) {
        DocDocument doc = new DocDocument();
        doc.setTitle((String) dto.get("title"));
        doc.setContent((String) dto.getOrDefault("content", ""));
        doc.setType((String) dto.getOrDefault("type", "other"));
        doc.setOwnerId((String) dto.get("ownerId"));
        doc.setGroupId((String) dto.get("groupId"));
        doc.setVisibility((String) dto.getOrDefault("visibility", "private"));
        doc.setStatus((String) dto.getOrDefault("status", "draft"));
        doc.setLastEditedBy((String) dto.get("ownerId"));
        doc.setCreatedAt(new Date());
        doc.setUpdatedAt(new Date());
        return docRepo.save(doc);
    }

    public java.util.List<DocDocument> findAll(String groupId) {
        return docRepo.findByGroupIdOrderByUpdatedAtDesc(groupId);
    }

    public DocDocument findOne(String id) {
        return docRepo.findById(id).orElseThrow(() -> new BizException(404, "文档不存在"));
    }

    public DocDocument update(String id, Map<String, Object> dto) {
        DocDocument doc = findOne(id);
        if (dto.containsKey("title")) doc.setTitle((String) dto.get("title"));
        if (dto.containsKey("content")) doc.setContent((String) dto.get("content"));
        if (dto.containsKey("type")) doc.setType((String) dto.get("type"));
        if (dto.containsKey("visibility")) doc.setVisibility((String) dto.get("visibility"));
        if (dto.containsKey("status")) doc.setStatus((String) dto.get("status"));
        doc.setUpdatedAt(new Date());
        if (dto.containsKey("lastEditedBy")) doc.setLastEditedBy((String) dto.get("lastEditedBy"));
        return docRepo.save(doc);
    }

    public void delete(String id) {
        if (!docRepo.existsById(id)) throw new BizException(404, "文档不存在");
        docRepo.deleteById(id);
    }
}