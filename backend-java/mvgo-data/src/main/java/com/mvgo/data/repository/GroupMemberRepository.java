package com.mvgo.data.repository;

import java.util.List;

import com.mvgo.data.entity.GroupMemberDocument;

import org.springframework.data.mongodb.repository.MongoRepository;

import org.springframework.stereotype.Repository;

@Repository
public interface GroupMemberRepository extends MongoRepository<GroupMemberDocument, String> {

    List<GroupMemberDocument> findByGroupId(String groupId);

    List<GroupMemberDocument> findByUserId(String userId);

    GroupMemberDocument findByGroupIdAndUserId(String groupId, String userId);

    void deleteByGroupId(String groupId);
}