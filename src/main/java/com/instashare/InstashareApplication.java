package com.instashare;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class InstashareApplication {
    public static void main(String[] args) {
        SpringApplication.run(InstashareApplication.class, args);
        System.out.println("Instashare server started on port 8080");
        System.out.println("UI available at http://localhost:3000");
    }
}
