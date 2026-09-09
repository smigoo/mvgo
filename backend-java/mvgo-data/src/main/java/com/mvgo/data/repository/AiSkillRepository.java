package com.mvgo.data.repository;

import java.util.List;

import com.mvgo.data.entity.AiSkillDocument;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AiSkillRepository extends MongoRepository<AiSkillDocument, String> {

    List<AiSkillDocument> findByStatusOrderBySortOrderAsc(String status);

    List<AiSkillDocument> findByVisibilityAndStatusOrderBySortOrderAsc(String visibility, String status);
}