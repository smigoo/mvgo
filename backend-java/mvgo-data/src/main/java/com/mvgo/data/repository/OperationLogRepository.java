package com.mvgo.data.repository;

import com.mvgo.data.entity.OperationLog;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

/**
 * 操作日志 Repository.
 *
 * @since 1.0.0
 */
@Repository
public interface OperationLogRepository extends MongoRepository<OperationLog, String> {
}
