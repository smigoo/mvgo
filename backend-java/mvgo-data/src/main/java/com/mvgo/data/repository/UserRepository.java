package com.mvgo.data.repository;

import com.mvgo.data.entity.UserDocument;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

/**
 * 用户 Repository（只读富化用，对应 users 集合）.
 *
 * @since 1.0.0
 */
@Repository
public interface UserRepository extends MongoRepository<UserDocument, String> {

    UserDocument findByUsername(String username);
}
