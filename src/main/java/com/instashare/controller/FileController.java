package com.instashare.controller;

import com.instashare.service.FileSharer;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.*;
import java.net.Socket;
import java.util.Map;
import java.util.UUID;

@RestController
@CrossOrigin(origins = "*")
public class FileController {

    private final FileSharer fileSharer;
    private final String uploadDir;

    public FileController(FileSharer fileSharer) {
        this.fileSharer = fileSharer;
        this.uploadDir = System.getProperty("java.io.tmpdir") + File.separator + "instashare-uploads";
        new File(uploadDir).mkdirs();
    }

    @PostMapping("/upload")
    public ResponseEntity<Map<String, Integer>> upload(@RequestParam("file") MultipartFile file) {
        try {
            String originalFilename = file.getOriginalFilename();
            if (originalFilename == null || originalFilename.isBlank()) {
                originalFilename = "unnamed-file";
            }

            String uniqueFilename = UUID.randomUUID() + "_" + new File(originalFilename).getName();
            String filePath = uploadDir + File.separator + uniqueFilename;

            try (FileOutputStream fos = new FileOutputStream(filePath)) {
                fos.write(file.getBytes());
            }

            int port = fileSharer.offerFile(filePath);
            new Thread(() -> fileSharer.startFileServer(port)).start();

            return ResponseEntity.ok(Map.of("port", port));

        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/download/{port}")
    public ResponseEntity<byte[]> download(@PathVariable int port) {
        try (Socket socket = new Socket("localhost", port);
             InputStream socketInput = socket.getInputStream()) {

            ByteArrayOutputStream headerBaos = new ByteArrayOutputStream();
            int b;
            while ((b = socketInput.read()) != -1) {
                if (b == '\n') break;
                headerBaos.write(b);
            }

            String header = headerBaos.toString().trim();
            String filename = header.startsWith("Filename: ")
                    ? header.substring("Filename: ".length())
                    : "downloaded-file";

            byte[] fileBytes = socketInput.readAllBytes();

            HttpHeaders headers = new HttpHeaders();
            headers.setContentDispositionFormData("attachment", filename);
            headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);

            return ResponseEntity.ok().headers(headers).body(fileBytes);

        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }
}