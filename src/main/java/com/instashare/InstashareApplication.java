package com.instashare;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Instashare — P2P File Sharing Application.
 *
 * JPA/DataSource auto-configuration is excluded by default because the core
 * signaling and nearby features are entirely in-memory.
 * When you set DATABASE_URL, re-enable JPA via a profile or by removing the exclusion.
 */
@SpringBootApplication(exclude = {
    DataSourceAutoConfiguration.class,
    HibernateJpaAutoConfiguration.class
})
@EnableAsync
@EnableScheduling
public class InstashareApplication {
    public static void main(String[] args) {
        SpringApplication.run(InstashareApplication.class, args);
        System.out.println("──────────────────────────────────────────");
        System.out.println("  Instashare server started");
        System.out.println("  http://localhost:8080");
        System.out.println("──────────────────────────────────────────");
    }
}
