package com.mvgo.data.repository;

import java.util.List;

import com.mvgo.data.entity.DocDocument;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface DocRepository extends MongoRepository<DocDocument, String> {

    List<DocDocument> findByGroupIdOrderByUpdatedAtDesc(String groupId);
}