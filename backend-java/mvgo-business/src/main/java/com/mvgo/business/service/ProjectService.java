package com.mvgo.business.service;

import java.util.Date;
import java.util.List;
import java.util.Map;

import com.mvgo.common.BizException;
import com.mvgo.data.entity.AiProjectDocument;
import com.mvgo.data.repository.AiProjectRepository;

import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;

/**
 * AI 项目管理服务（对齐 Node projects.service）.
 *
 * @since 1.0.0
 */
@Service
public class ProjectService {

    private final AiProjectRepository projectRepo;
    private final MongoTemplate mongoTemplate;

    public ProjectService(AiProjectRepository projectRepo, MongoTemplate mongoTemplate) {
        this.projectRepo = projectRepo;
        this.mongoTemplate = mongoTemplate;
    }

    public List<AiProjectDocument> findAll(String userId) {
        return projectRepo.findByStatusAndAdminUserIdsContaining("active", userId);
    }

    public AiProjectDocument findById(String id, String userId) {
        Query query = new Query(Criteria.where("_id").is(id).and("status").is("active"));
        if (userId != null) query.addCriteria(Criteria.where("adminUserIds").is(userId));
        AiProjectDocument project = mongoTemplate.findOne(query, AiProjectDocument.class);
        if (project == null) throw new BizException(404, "项目不存在");
        return project;
    }

    public AiProjectDocument create(Map<String, Object> dto, String userId) {
        AiProjectDocument project = new AiProjectDocument();
        project.setName((String) dto.get("name"));
        project.setDescription((String) dto.getOrDefault("description", ""));
        project.setGitUrl((String) dto.getOrDefault("gitUrl", ""));
        project.setGitBranch((String) dto.getOrDefault("gitBranch", "main"));
        project.setGitDefaultPath((String) dto.getOrDefault("gitDefaultPath", "docs/"));
        project.setAdminUserIds(List.of(userId));
        project.setAuthorizedGroupIds(List.of());
        project.setStatus("active");
        project.setCreatedAt(new Date());
        project.setUpdatedAt(new Date());
        return projectRepo.save(project);
    }

    public AiProjectDocument update(String id, Map<String, Object> dto, String userId) {
        AiProjectDocument project = findById(id, userId);
        Query query = new Query(Criteria.where("_id").is(id));
        if (userId != null) query.addCriteria(Criteria.where("adminUserIds").is(userId));
        Update update = new Update().set("updatedAt", new Date());
        if (dto.containsKey("name")) update.set("name", dto.get("name"));
        if (dto.containsKey("description")) update.set("description", dto.get("description"));
        if (dto.containsKey("gitUrl")) update.set("gitUrl", dto.get("gitUrl"));
        if (dto.containsKey("gitBranch")) update.set("gitBranch", dto.get("gitBranch"));
        mongoTemplate.updateFirst(query, update, AiProjectDocument.class);
        return projectRepo.findById(id).orElse(null);
    }

    public void archive(String id, String userId) {
        findById(id, userId);
        Query query = new Query(Criteria.where("_id").is(id));
        if (userId != null) query.addCriteria(Criteria.where("adminUserIds").is(userId));
        mongoTemplate.updateFirst(query, Update.update("status", "archived").set("updatedAt", new Date()),
                AiProjectDocument.class);
    }
}