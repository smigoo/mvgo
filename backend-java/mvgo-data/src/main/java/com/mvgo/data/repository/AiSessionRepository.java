package com.mvgo.data.repository;

import java.util.List;

import com.mvgo.data.entity.AiSessionDocument;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AiSessionRepository extends MongoRepository<AiSessionDocument, String> {

    List<AiSessionDocument> findByUserIdOrderByUpdatedAtDesc(String userId);

    List<AiSessionDocument> findByProjectIdOrderByUpdatedAtDesc(String projectId);
}