package com.instashare.controller;

import com.instashare.model.NearbyDevice;
import com.instashare.service.NearbyService;
import jakarta.servlet.http.HttpServletRequest;
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
 * Nearby devices controller — SSE-based LAN presence discovery.
 * Devices on the same public IP are grouped as "nearby" (same WiFi/LAN).
 *
 * GET  /api/nearby — SSE: register device and receive nearby updates
 * POST /api/nearby — Send a transfer request to a nearby device
 */
@RestController
@RequestMapping("/api/nearby")
@CrossOrigin(origins = "*")
public class NearbyController {

    private final NearbyService nearbyService;
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(4);

    public NearbyController(NearbyService nearbyService) {
        this.nearbyService = nearbyService;
    }

    /* ─── GET: SSE — register device and receive nearby updates ──────────── */
    @GetMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter registerDevice(
            @RequestParam(defaultValue = "Unknown Device") String name,
            HttpServletRequest request) {

        String ip = getClientIP(request);
        String deviceId = nearbyService.generateDeviceId();

        // 5-minute timeout for the SSE connection
        SseEmitter emitter = new SseEmitter(5 * 60 * 1000L);

        // Register the device
        NearbyDevice device = nearbyService.registerDevice(deviceId, name, ip);
        device.addEmitter(emitter);

        // Send device ID to client
        try {
            emitter.send(SseEmitter.event().data(Map.of("type", "registered", "deviceId", deviceId)));
        } catch (IOException ignored) {}

        // Send current nearby devices
        List<Map<String, String>> nearby = nearbyService.getNearbyDevices(ip, deviceId);
        try {
            emitter.send(SseEmitter.event().data(Map.of("type", "devices", "devices", nearby)));
        } catch (IOException ignored) {}

        // Broadcast to all nearby that a new device joined
        nearbyService.broadcastToIP(ip);

        // Heartbeat every 20 seconds
        ScheduledFuture<?> heartbeat = scheduler.scheduleAtFixedRate(() -> {
            NearbyDevice dev = nearbyService.getDevice(deviceId);
            if (dev != null) dev.touch();
            try {
                emitter.send(SseEmitter.event().data(Map.of("type", "ping")));
            } catch (IOException | IllegalStateException e) {
                // Emitter is dead — will be cleaned up
            }
        }, 20, 20, TimeUnit.SECONDS);

        // Cleanup on disconnect
        Runnable cleanup = () -> {
            heartbeat.cancel(false);
            nearbyService.removeDevice(deviceId);
            nearbyService.broadcastToIP(ip); // Notify others this device left
        };

        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(t -> cleanup.run());

        return emitter;
    }

    /* ─── POST: Send a transfer request to a nearby device ──────────────── */
    @PostMapping
    public ResponseEntity<?> handlePost(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        String action = (String) body.get("action");

        if ("transfer-request".equals(action)) {
            String targetId = (String) body.get("targetId");
            String targetName = (String) body.get("targetName");

            if (targetId == null && targetName == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Missing targetId or targetName"));
            }

            boolean sent = false;
            if (targetId != null) {
                sent = nearbyService.sendTransferRequest(targetId, body);
            } else if (targetName != null) {
                sent = nearbyService.sendTransferRequestByName(targetName, getClientIP(request), body);
            }

            if (!sent) {
                return ResponseEntity.status(404).body(Map.of("error", "Device not found"));
            }

            return ResponseEntity.ok(Map.of("ok", true));
        }

        return ResponseEntity.badRequest().body(Map.of("error", "Invalid action"));
    }

    /* ─── Helper: Extract client IP ─────────────────────────────────────── */
    private String getClientIP(HttpServletRequest request) {
        // Check forwarded headers (behind proxy / load balancer)
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isEmpty()) {
            return forwarded.split(",")[0].trim();
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isEmpty()) {
            return realIp;
        }
        return request.getRemoteAddr();
    }
}
