package com.mvgo.business.service;

import java.util.List;

import com.mvgo.data.entity.AiSkillDocument;
import com.mvgo.data.repository.AiSkillRepository;

import org.springframework.stereotype.Service;

@Service
public class SkillService {

    private final AiSkillRepository skillRepo;

    public SkillService(AiSkillRepository skillRepo) {
        this.skillRepo = skillRepo;
    }

    public List<AiSkillDocument> findAll() {
        return skillRepo.findByStatusOrderBySortOrderAsc("active");
    }
}