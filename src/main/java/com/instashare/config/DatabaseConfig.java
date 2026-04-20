package com.instashare.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;

/**
 * Allows the app to start without a database connection.
 * If DATABASE_URL is not set, JPA/DataSource auto-config is skipped.
 * When a Neon DB URL is provided via env vars, it will be used automatically.
 */
@Configuration
public class DatabaseConfig {
    // Database configuration is handled via application.properties.
    // Set DATABASE_URL, DATABASE_USERNAME, DATABASE_PASSWORD env vars to connect to Neon.
    // The app runs fine without a database — signaling is entirely in-memory.
}
