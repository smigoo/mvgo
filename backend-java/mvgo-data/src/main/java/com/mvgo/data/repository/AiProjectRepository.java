package com.mvgo.data.repository;

import java.util.List;

import com.mvgo.data.entity.AiProjectDocument;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AiProjectRepository extends MongoRepository<AiProjectDocument, String> {

    List<AiProjectDocument> findByStatusAndAdminUserIdsContaining(String status, String adminUserId);
}