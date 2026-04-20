package com.instashare.service;

import com.instashare.model.NearbyDevice;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;

/**
 * In-memory nearby device registry.
 * Devices on the same public IP are grouped as "nearby" (same WiFi/LAN).
 */
@Service
public class NearbyService {

    private final ConcurrentHashMap<String, NearbyDevice> devices = new ConcurrentHashMap<>();

    /**
     * Generate a unique device ID.
     */
    public String generateDeviceId() {
        return Long.toString(ThreadLocalRandom.current().nextLong(0, Long.MAX_VALUE), 36)
             + Long.toString(System.currentTimeMillis(), 36);
    }

    /**
     * Register a device and return its ID.
     */
    public NearbyDevice registerDevice(String deviceId, String name, String ip) {
        NearbyDevice device = new NearbyDevice(deviceId, name, ip);
        devices.put(deviceId, device);
        return device;
    }

    /**
     * Remove a device.
     */
    public void removeDevice(String deviceId) {
        devices.remove(deviceId);
    }

    /**
     * Get a device by ID.
     */
    public NearbyDevice getDevice(String deviceId) {
        return devices.get(deviceId);
    }

    /**
     * Get all devices on the same IP, excluding the given deviceId.
     */
    public List<Map<String, String>> getNearbyDevices(String ip, String excludeId) {
        List<Map<String, String>> nearby = new ArrayList<>();
        for (NearbyDevice dev : devices.values()) {
            if (dev.getIp().equals(ip) && !dev.getId().equals(excludeId)) {
                nearby.add(Map.of("id", dev.getId(), "name", dev.getName()));
            }
        }
        return nearby;
    }

    /**
     * Broadcast updated device list to all devices on a given IP.
     */
    public void broadcastToIP(String ip) {
        for (NearbyDevice dev : devices.values()) {
            if (dev.getIp().equals(ip)) {
                List<Map<String, String>> nearby = getNearbyDevices(ip, dev.getId());
                Map<String, Object> event = Map.of("type", "devices", "devices", nearby);
                sendToDevice(dev, event);
            }
        }
    }

    /**
     * Send a transfer request to a specific device.
     */
    public boolean sendTransferRequest(String targetId, Map<String, Object> request) {
        NearbyDevice target = devices.get(targetId);
        if (target == null) return false;

        Map<String, Object> event = new HashMap<>();
        event.put("type", "transfer-request");
        event.put("fromId", request.get("senderId"));
        event.put("fromName", request.get("senderName"));
        event.put("key", request.get("key"));
        event.put("filesMeta", request.get("filesMeta"));

        sendToDevice(target, event);
        return true;
    }

    /**
     * Send an SSE event to all emitters of a device.
     */
    private void sendToDevice(NearbyDevice device, Map<String, Object> event) {
        Iterator<SseEmitter> it = device.getEmitters().iterator();
        while (it.hasNext()) {
            SseEmitter emitter = it.next();
            try {
                emitter.send(SseEmitter.event().data(event));
            } catch (IOException | IllegalStateException e) {
                device.removeEmitter(emitter);
            }
        }
    }

    /**
     * Clean up stale devices every 30 seconds.
     */
    @Scheduled(fixedRate = 30_000)
    public void cleanStale() {
        devices.entrySet().removeIf(entry -> {
            if (entry.getValue().isStale()) {
                String ip = entry.getValue().getIp();
                // Complete emitters
                entry.getValue().getEmitters().forEach(emitter -> {
                    try { emitter.complete(); } catch (Exception ignored) {}
                });
                return true;
            }
            return false;
        });
    }
}
