package com.mvgo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 感智晓界 — Java 后端启动入口
 *
 * @since 1.0.0
 */
@SpringBootApplication(scanBasePackages = "com.mvgo")
@EnableScheduling
public class MvgoApplication {

    public static void main(String[] args) {
        SpringApplication.run(MvgoApplication.class, args);
    }
}
