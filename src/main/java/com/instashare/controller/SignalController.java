package com.instashare.controller;

import com.instashare.model.SignalRoom;
import com.instashare.service.SignalService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * WebRTC signaling controller.
 *
 * POST /api/signal          — create room | submit answer | add ICE candidate
 * GET  /api/signal          — get room data (offer + filesMeta)
 * GET  /api/signal/stream   — SSE stream for sender to receive answer/ICE events
 */
@RestController
@RequestMapping("/api/signal")
@CrossOrigin(origins = "*")
public class SignalController {

    private final SignalService signalService;
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2);

    public SignalController(SignalService signalService) {
        this.signalService = signalService;
    }

    /* ─── POST: Create room / Submit answer / Add ICE candidate ─────────── */
    @PostMapping
    public ResponseEntity<?> handlePost(@RequestBody Map<String, Object> body) {
        String action = (String) body.get("action");

        if ("create".equals(action)) {
            Object offer = body.get("offer");
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> filesMeta = (List<Map<String, Object>>) body.get("filesMeta");

            if (offer == null || filesMeta == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Missing offer or filesMeta"));
            }

            try {
                String key = signalService.createRoom(offer, filesMeta);
                return ResponseEntity.ok(Map.of("key", key));
            } catch (RuntimeException e) {
                return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
            }
        }

        if ("answer".equals(action)) {
            String key = (String) body.get("key");
            Object answer = body.get("answer");
            @SuppressWarnings("unchecked")
            List<Object> candidates = (List<Object>) body.get("candidates");

            if (key == null || answer == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Missing key or answer"));
            }

            SignalRoom room = signalService.getRoom(key);
            if (room == null) {
                return ResponseEntity.status(404).body(Map.of("error", "Room not found"));
            }

            try {
                signalService.submitAnswer(key, answer, candidates);
                return ResponseEntity.ok(Map.of("ok", true));
            } catch (RuntimeException e) {
                return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
            }
        }

        if ("ice".equals(action)) {
            String key = (String) body.get("key");
            Object candidate = body.get("candidate");

            if (key == null || candidate == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Missing key or candidate"));
            }

            SignalRoom room = signalService.getRoom(key);
            if (room == null) {
                return ResponseEntity.status(404).body(Map.of("error", "Room not found"));
            }

            try {
                signalService.addIceCandidate(key, candidate);
                return ResponseEntity.ok(Map.of("ok", true));
            } catch (RuntimeException e) {
                return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
            }
        }

        return ResponseEntity.badRequest().body(Map.of("error", "Invalid action"));
    }

    /* ─── GET: Retrieve room data (receiver checks for offer) ──────────── */
    @GetMapping
    public ResponseEntity<?> getRoom(@RequestParam String key) {
        if (key == null || key.length() != 6) {
            return ResponseEntity.badRequest().body(Map.of("exists", false));
        }

        SignalRoom room = signalService.getRoom(key);
        if (room == null) {
            return ResponseEntity.status(404).body(Map.of("exists", false));
        }

        return ResponseEntity.ok(Map.of(
            "exists", true,
            "offer", room.getOffer(),
            "filesMeta", room.getFilesMeta()
        ));
    }

    /* ─── GET /stream: SSE stream for sender to receive answer/ICE events ── */
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamSignal(@RequestParam String key) {
        if (key == null || key.length() != 6) {
            SseEmitter emitter = new SseEmitter(0L);
            try {
                emitter.send(SseEmitter.event().data(Map.of("type", "error", "message", "Invalid key")));
            } catch (IOException ignored) {}
            emitter.complete();
            return emitter;
        }

        SignalRoom room = signalService.getRoom(key);
        if (room == null) {
            SseEmitter emitter = new SseEmitter(0L);
            try {
                emitter.send(SseEmitter.event().data(Map.of("type", "error", "message", "Room not found")));
            } catch (IOException ignored) {}
            emitter.complete();
            return emitter;
        }

        // 10-minute timeout
        SseEmitter emitter = new SseEmitter(10 * 60 * 1000L);

        // Register emitter with the room
        signalService.addSenderEmitter(key, emitter);

        // Send initial heartbeat
        try {
            emitter.send(SseEmitter.event().data(Map.of("type", "connected")));
        } catch (IOException ignored) {}

        // If answer already exists, send it immediately
        if (room.getAnswer() != null) {
            try {
                emitter.send(SseEmitter.event().data(Map.of(
                    "type", "answer",
                    "answer", room.getAnswer(),
                    "candidates", room.getCandidates()
                )));
            } catch (IOException ignored) {}
        }

        // Heartbeat every 15 seconds
        ScheduledFuture<?> heartbeat = scheduler.scheduleAtFixedRate(() -> {
            try {
                emitter.send(SseEmitter.event().data(Map.of("type", "ping")));
            } catch (IOException | IllegalStateException e) {
                // Emitter is dead — will be cleaned up via onCompletion/onError
            }
        }, 15, 15, TimeUnit.SECONDS);

        // Cleanup on completion, timeout, or error
        Runnable cleanup = () -> {
            heartbeat.cancel(false);
            signalService.removeSenderEmitter(key, emitter);
        };

        emitter.onCompletion(cleanup);
        emitter.onTimeout(() -> {
            cleanup.run();
            try {
                emitter.send(SseEmitter.event().data(Map.of("type", "expired")));
            } catch (IOException | IllegalStateException ignored) {}
            emitter.complete();
        });
        emitter.onError(t -> cleanup.run());

        return emitter;
    }
}
