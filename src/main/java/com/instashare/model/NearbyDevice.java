package com.instashare.model;

import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Represents a device registered for LAN nearby discovery.
 * Devices on the same public IP are considered "nearby" (same WiFi/LAN).
 */
public class NearbyDevice {

    private final String id;
    private final String name;
    private final String ip;
    private final List<SseEmitter> emitters;
    private volatile long lastSeen;

    public NearbyDevice(String id, String name, String ip) {
        this.id = id;
        this.name = name;
        this.ip = ip;
        this.emitters = new CopyOnWriteArrayList<>();
        this.lastSeen = System.currentTimeMillis();
    }

    public String getId() { return id; }
    public String getName() { return name; }
    public String getIp() { return ip; }

    public List<SseEmitter> getEmitters() { return emitters; }
    public void addEmitter(SseEmitter emitter) { this.emitters.add(emitter); }
    public void removeEmitter(SseEmitter emitter) { this.emitters.remove(emitter); }

    public long getLastSeen() { return lastSeen; }
    public void touch() { this.lastSeen = System.currentTimeMillis(); }

    public boolean isStale() {
        return System.currentTimeMillis() - lastSeen > 2 * 60 * 1000; // 2 minutes
    }
}
