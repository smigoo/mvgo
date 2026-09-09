package com.mvgo.business.service;

import java.util.Date;
import java.util.Map;

import com.mvgo.common.BizException;
import com.mvgo.data.entity.AiSessionDocument;
import com.mvgo.data.repository.AiSessionRepository;

import org.springframework.stereotype.Service;

@Service
public class SessionService {

    private final AiSessionRepository sessionRepo;

    public SessionService(AiSessionRepository sessionRepo) {
        this.sessionRepo = sessionRepo;
    }

    public java.util.List<AiSessionDocument> findAll(String userId) {
        return sessionRepo.findByUserIdOrderByUpdatedAtDesc(userId);
    }

    public AiSessionDocument findById(String id) {
        return sessionRepo.findById(id).orElseThrow(() -> new BizException(404, "会话不存在"));
    }

    public AiSessionDocument create(Map<String, Object> dto, String userId) {
        AiSessionDocument session = new AiSessionDocument();
        session.setProjectId((String) dto.get("projectId"));
        session.setUserId(userId);
        session.setTitle((String) dto.getOrDefault("title", "未命名会话"));
        session.setModelProvider((String) dto.getOrDefault("modelProvider", ""));
        session.setModelName((String) dto.getOrDefault("modelName", ""));
        session.setMessages(java.util.List.of());
        session.setMessageCount(0);
        session.setCreatedAt(new Date());
        session.setUpdatedAt(new Date());
        return sessionRepo.save(session);
    }

    public AiSessionDocument update(String id, Map<String, Object> dto) {
        AiSessionDocument session = findById(id);
        if (dto.containsKey("title")) session.setTitle((String) dto.get("title"));
        if (dto.containsKey("messages")) {
            @SuppressWarnings("unchecked")
            var msgs = (java.util.List<Map<String, Object>>) dto.get("messages");
            session.setMessages(msgs);
            session.setMessageCount(msgs != null ? msgs.size() : 0);
        }
        session.setUpdatedAt(new Date());
        return sessionRepo.save(session);
    }

    public void delete(String id) {
        if (!sessionRepo.existsById(id)) throw new BizException(404, "会话不存在");
        sessionRepo.deleteById(id);
    }
}