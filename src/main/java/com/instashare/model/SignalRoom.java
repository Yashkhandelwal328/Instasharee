package com.instashare.model;

import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Represents a WebRTC signaling room.
 * A sender creates a room with their SDP offer + file metadata.
 * A receiver retrieves the offer, then submits their SDP answer.
 * SSE emitters notify the sender when the answer arrives.
 */
public class SignalRoom {

    private final String key;
    private final Object offer;             // SDP offer (JSON object)
    private final List<Map<String, Object>> filesMeta;  // File metadata list
    private volatile Object answer;          // SDP answer (JSON object)
    private final List<Object> candidates;   // ICE candidates
    private final List<SseEmitter> senderEmitters;  // SSE emitters for sender
    private final long createdAt;

    public SignalRoom(String key, Object offer, List<Map<String, Object>> filesMeta) {
        this.key = key;
        this.offer = offer;
        this.filesMeta = filesMeta;
        this.answer = null;
        this.candidates = new CopyOnWriteArrayList<>();
        this.senderEmitters = new CopyOnWriteArrayList<>();
        this.createdAt = System.currentTimeMillis();
    }

    public String getKey() { return key; }
    public Object getOffer() { return offer; }
    public List<Map<String, Object>> getFilesMeta() { return filesMeta; }

    public Object getAnswer() { return answer; }
    public void setAnswer(Object answer) { this.answer = answer; }

    public List<Object> getCandidates() { return candidates; }
    public void addCandidate(Object candidate) { this.candidates.add(candidate); }
    public void setCandidates(List<Object> candidates) {
        this.candidates.clear();
        if (candidates != null) {
            this.candidates.addAll(candidates);
        }
    }

    public List<SseEmitter> getSenderEmitters() { return senderEmitters; }
    public void addSenderEmitter(SseEmitter emitter) { this.senderEmitters.add(emitter); }
    public void removeSenderEmitter(SseEmitter emitter) { this.senderEmitters.remove(emitter); }

    public long getCreatedAt() { return createdAt; }

    public boolean isExpired() {
        return System.currentTimeMillis() - createdAt > 10 * 60 * 1000; // 10 minutes
    }
}
