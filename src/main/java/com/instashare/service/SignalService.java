package com.instashare.service;

import com.instashare.model.SignalRoom;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;

/**
 * In-memory signaling service for WebRTC room management.
 * Rooms are ephemeral — they expire after 10 minutes.
 */
@Service
public class SignalService {

    private final ConcurrentHashMap<String, SignalRoom> rooms = new ConcurrentHashMap<>();

    /**
     * Generate a unique 6-digit key and create a new room.
     */
    public String createRoom(Object offer, List<Map<String, Object>> filesMeta) {
        String key = generateKey();
        if (key == null) {
            throw new RuntimeException("Could not generate unique key");
        }
        rooms.put(key, new SignalRoom(key, offer, filesMeta));
        return key;
    }

    /**
     * Get a room by key.
     */
    public SignalRoom getRoom(String key) {
        return rooms.get(key);
    }

    /**
     * Submit an SDP answer and ICE candidates from the receiver.
     * Notifies all sender SSE emitters.
     */
    public void submitAnswer(String key, Object answer, List<Object> candidates) {
        SignalRoom room = rooms.get(key);
        if (room == null) {
            throw new RuntimeException("Room not found");
        }

        room.setAnswer(answer);
        room.setCandidates(candidates);

        // Notify sender via SSE
        Map<String, Object> event = Map.of(
            "type", "answer",
            "answer", answer,
            "candidates", room.getCandidates()
        );
        broadcastToSender(room, event);
    }

    /**
     * Add a late ICE candidate from the receiver.
     */
    public void addIceCandidate(String key, Object candidate) {
        SignalRoom room = rooms.get(key);
        if (room == null) {
            throw new RuntimeException("Room not found");
        }

        room.addCandidate(candidate);

        // Push to sender's SSE stream
        Map<String, Object> event = Map.of(
            "type", "ice",
            "candidate", candidate
        );
        broadcastToSender(room, event);
    }

    /**
     * Register an SSE emitter for a room (sender subscribes for answer events).
     */
    public void addSenderEmitter(String key, SseEmitter emitter) {
        SignalRoom room = rooms.get(key);
        if (room != null) {
            room.addSenderEmitter(emitter);
        }
    }

    /**
     * Remove an SSE emitter from a room.
     */
    public void removeSenderEmitter(String key, SseEmitter emitter) {
        SignalRoom room = rooms.get(key);
        if (room != null) {
            room.removeSenderEmitter(emitter);
        }
    }

    /**
     * Broadcast an event to all sender SSE emitters in a room.
     */
    private void broadcastToSender(SignalRoom room, Map<String, Object> event) {
        Iterator<SseEmitter> it = room.getSenderEmitters().iterator();
        while (it.hasNext()) {
            SseEmitter emitter = it.next();
            try {
                emitter.send(SseEmitter.event().data(event));
            } catch (IOException | IllegalStateException e) {
                // Emitter is closed/completed — remove it
                room.removeSenderEmitter(emitter);
            }
        }
    }

    /**
     * Generate a unique 6-digit numeric key.
     */
    private String generateKey() {
        for (int attempt = 0; attempt < 100; attempt++) {
            String key = String.valueOf(ThreadLocalRandom.current().nextInt(100_000, 1_000_000));
            if (!rooms.containsKey(key)) {
                return key;
            }
        }
        return null;
    }

    /**
     * Clean up expired rooms every 60 seconds.
     */
    @Scheduled(fixedRate = 60_000)
    public void cleanExpired() {
        rooms.entrySet().removeIf(entry -> {
            if (entry.getValue().isExpired()) {
                // Complete all emitters before removing
                entry.getValue().getSenderEmitters().forEach(emitter -> {
                    try {
                        emitter.send(SseEmitter.event().data(Map.of("type", "expired")));
                        emitter.complete();
                    } catch (IOException | IllegalStateException ignored) {}
                });
                return true;
            }
            return false;
        });
    }
}
