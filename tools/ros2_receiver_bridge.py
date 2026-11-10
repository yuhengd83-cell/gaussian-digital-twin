#!/usr/bin/env python3
"""AGV Viewer v5.5.8.4: READ-ONLY ROS2 topic discovery and WebSocket relay.

Protocol: agv-ros2-sub-v1.  Deliberately *not* a rosbridge protocol server.
No publish, parameter write, service call, or AGV command endpoints exist.
With --demo, no ROS2 modules are imported and all packets are labelled DEMO.
"""
from __future__ import annotations

import argparse
import asyncio
import hmac
import json
import itertools
import math
import os
import signal
import sys
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable

try:
    from websockets.asyncio.server import serve
except ImportError:  # Ubuntu 22.04 may ship websockets 10.x.
    from websockets.server import serve

PROTOCOL = "agv-ros2-sub-v1"
MAX_TOPICS = 12
MAX_NODES = 150
MAX_GRAPH_TOPICS = 350
MAX_LIST_ITEMS = 14
MIN_INTERVAL = .16  # At most 6.25 forwarded previews per topic per second.


def _safe_value(obj: Any, *, depth: int = 0, field_name: str = "") -> Any:
    """Summarize ROS messages without streaming raw binary sensor frames."""
    if depth >= 5:
        return "<depth limit>"
    if obj is None or isinstance(obj, (bool, int)):
        return obj
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, str):
        return obj[:1024] + ("..." if len(obj) > 1024 else "")
    if isinstance(obj, (bytes, bytearray, memoryview)):
        return {"bytes_omitted": len(obj)}
    if field_name in ("data", "points", "ranges", "intensities", "channels", "image"):
        try:
            length = len(obj)
        except (TypeError, ValueError):
            length = None
        if length is not None and length > MAX_LIST_ITEMS:
            return {"elements_omitted": length, "note": "large sensor payload not forwarded"}
    if isinstance(obj, dict):
        return {str(k)[:80]: _safe_value(v, depth=depth + 1, field_name=str(k)) for k, v in list(obj.items())[:55]}
    if hasattr(obj, "get_fields_and_field_types"):
        # ROS2 messages expose their own member names without a JSON library.
        out = {}
        for name in list(obj.get_fields_and_field_types())[:55]:
            try:
                out[name] = _safe_value(getattr(obj, name), depth=depth + 1, field_name=name)
            except (AttributeError, TypeError, ValueError):
                out[name] = "<unavailable>"
        return out
    if hasattr(obj, "tolist"):
        try:
            count = getattr(obj, "size", None)
            if count is not None and int(count) > MAX_LIST_ITEMS:
                return {"elements_omitted": int(count)}
            return _safe_value(obj.tolist(), depth=depth + 1, field_name=field_name)
        except (TypeError, ValueError):
            return "<array omitted>"
    if hasattr(obj, "__len__") and hasattr(obj, "__iter__"):
        try:
            length = len(obj)
            return {
                "length": length,
                "sample": [_safe_value(item, depth=depth + 1) for item in list(itertools.islice(obj, MAX_LIST_ITEMS))],
                "truncated": length > MAX_LIST_ITEMS,
            } if length > MAX_LIST_ITEMS else [
                _safe_value(item, depth=depth + 1) for item in obj
            ]
        except (TypeError, ValueError):
            return "<array unavailable>"
    return str(obj)[:180]


@dataclass
class Client:
    ws: Any
    outgoing: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=80))
    active: set[str] = field(default_factory=set)
    authorized: bool = False


class DemoGraph:
    """Synthetic graph for UI testing only; never presented as actual ROS2."""
    def __init__(self):
        self.publishers = {
            "/demo/gnss/fix": "sensor_msgs/msg/NavSatFix",
            "/demo/odometry": "nav_msgs/msg/Odometry",
            "/demo/imu": "sensor_msgs/msg/Imu",
            "/demo/status": "std_msgs/msg/String",
        }

    def graph(self):
        return {
            "topics": [
                {"name": name, "types": [type_name], "publishers": 1, "subscribers": 0}
                for name, type_name in self.publishers.items()
            ],
            "nodes": [
                {"name": "mock_gnss", "namespace": "/demo", "publishes": ["/demo/gnss/fix"], "subscribes": []},
                {"name": "mock_localization", "namespace": "/demo", "publishes": ["/demo/odometry", "/demo/imu"], "subscribes": []},
                {"name": "mock_status", "namespace": "/demo", "publishes": ["/demo/status"], "subscribes": []},
            ],
        }

    def start_topic(self, name: str, dtype: str, callback: Callable):
        if self.publishers.get(name) != dtype:
            raise ValueError("topic type mismatch")

    def stop_topic(self, name: str):
        return None

    def shutdown(self):
        return None


class RealROS2:
    def __init__(self):
        try:
            import rclpy
            from rclpy.node import Node
            from rclpy.executors import SingleThreadedExecutor
            from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy, DurabilityPolicy
            from rosidl_runtime_py.utilities import get_message
        except ImportError as exc:
            raise RuntimeError(
                "ROS2 Python modules unavailable. Source /opt/ros/humble/setup.bash "
                "and your workspace install/setup.bash, then run with the system Python 3."
            ) from exc
        self.rclpy = rclpy
        self.get_message = get_message
        self.QoSProfile = QoSProfile
        self.ReliabilityPolicy = ReliabilityPolicy
        self.HistoryPolicy = HistoryPolicy
        self.DurabilityPolicy = DurabilityPolicy
        self.lock = threading.RLock()
        rclpy.init()
        self.node: Node = rclpy.create_node("agv_web_receiver_readonly")
        self.executor = SingleThreadedExecutor()
        self.executor.add_node(self.node)
        self.subscribers = {}
        self.thread = threading.Thread(target=self.executor.spin, name="ros2-spin", daemon=True)
        self.thread.start()

    def graph(self):
        with self.lock:
            topics = []
            for name, types in sorted(self.node.get_topic_names_and_types())[:MAX_GRAPH_TOPICS]:
                topics.append({
                    "name": name, "types": types,
                    "publishers": self.node.count_publishers(name),
                    "subscribers": self.node.count_subscribers(name),
                })
            nodes = []
            for name, namespace in sorted(self.node.get_node_names_and_namespaces())[:MAX_NODES]:
                try:
                    pub = self.node.get_publisher_names_and_types_by_node(name, namespace)
                    sub = self.node.get_subscriber_names_and_types_by_node(name, namespace)
                except Exception:
                    pub, sub = [], []
                nodes.append({
                    "name": name,
                    "namespace": namespace,
                    "publishes": [p[0] for p in pub][:80],
                    "subscribes": [p[0] for p in sub][:80],
                })
            return {"topics": topics, "nodes": nodes}

    def start_topic(self, name: str, dtype: str, callback: Callable):
        with self.lock:
            if name in self.subscribers:
                return
            cls = self.get_message(dtype)
            # BEST_EFFORT subscriber is compatible with BEST_EFFORT and RELIABLE
            # volatile publishers. Keep queue depth short for live previews.
            qos = self.QoSProfile(
                history=self.HistoryPolicy.KEEP_LAST,
                depth=5,
                reliability=self.ReliabilityPolicy.BEST_EFFORT,
                durability=self.DurabilityPolicy.VOLATILE,
            )
            # /tf_static needs a transient-local subscriber to get latched transforms.
            if name == "/tf_static":
                qos.reliability = self.ReliabilityPolicy.RELIABLE
                qos.durability = self.DurabilityPolicy.TRANSIENT_LOCAL
            sub = self.node.create_subscription(
                cls, name, lambda msg, t=name, ty=dtype: callback(t, ty, msg), qos
            )
            self.subscribers[name] = sub

    def stop_topic(self, name: str):
        with self.lock:
            sub = self.subscribers.pop(name, None)
            if sub is not None:
                self.node.destroy_subscription(sub)

    def shutdown(self):
        try:
            self.executor.shutdown(timeout_sec=3)
        finally:
            self.thread.join(timeout=4)
            self.node.destroy_node()
            self.rclpy.shutdown()


class ReceiverServer:
    def __init__(self, source: Any, token: str, demo: bool):
        self.source = source
        self.token = token
        self.demo = demo
        self.clients: dict[Any, Client] = {}
        self.loop: asyncio.AbstractEventLoop | None = None
        self.forward_at: dict[str, float] = {}
        self.sequence: dict[str, int] = {}
        self.topic_types: dict[str, str] = {}

    def queue(self, state: Client, packet: dict):
        if state.outgoing.full():
            if packet.get("op") == "message":
                return  # slow clients miss frames; never buffer infinitely
            try:
                state.outgoing.get_nowait()
            except asyncio.QueueEmpty:
                pass
        state.outgoing.put_nowait(packet)

    def broadcast_preview(self, topic: str, dtype: str, raw: Any):
        """May be invoked on the ROS executor thread."""
        now = time.monotonic()
        if now - self.forward_at.get(topic, -100.0) < MIN_INTERVAL:
            return
        self.forward_at[topic] = now
        safe = _safe_value(raw)
        preview = json.dumps(safe, ensure_ascii=False, allow_nan=False)
        if len(preview) > 12000:
            safe = {"notice": "preview truncated at 12K characters", "prefix": preview[:6000]}
        if self.loop is not None and self.loop.is_running():
            try:
                self.loop.call_soon_threadsafe(self._deliver, topic, dtype, safe)
            except RuntimeError:
                pass

    def _deliver(self, topic: str, dtype: str, preview: Any):
        self.sequence[topic] = self.sequence.get(topic, 0) + 1
        packet = {
            "op": "message", "topic": topic, "type": dtype,
            "seq": self.sequence[topic], "received_at": time.time(),
            "source": "DEMO" if self.demo else "ROS2",
            "payload": preview,
        }
        for state in self.clients.values():
            if state.authorized and topic in state.active:
                self.queue(state, packet)

    async def writer(self, state: Client):
        while True:
            packet = await state.outgoing.get()
            await state.ws.send(json.dumps(packet, ensure_ascii=False, allow_nan=False))

    async def on_graph(self, state: Client):
        try:
            snapshot = await asyncio.to_thread(self.source.graph)
            self.queue(state, {"op": "graph", "source": "DEMO" if self.demo else "ROS2", **snapshot})
        except Exception as exc:
            self.queue(state, {"op": "error", "message": "ROS graph discovery failed: " + str(exc)[:250]})

    async def subscribe(self, state: Client, requested: Any):
        if not isinstance(requested, list):
            self.queue(state, {"op": "error", "message": "topics must be an array"})
            return
        names = list(dict.fromkeys(str(x) for x in requested if isinstance(x, str)))
        if len(names) + len(state.active) > MAX_TOPICS and len(set(names) | state.active) > MAX_TOPICS:
            self.queue(state, {"op": "subscribe_result", "results": [], "error": f"max {MAX_TOPICS} topics per browser"})
            return
        graph = await asyncio.to_thread(self.source.graph)
        known = {p["name"]: p.get("types", []) for p in graph["topics"]}
        results = []
        for name in names:
            if name in state.active:
                results.append({"topic": name, "ok": True, "detail": "already subscribed"})
                continue
            types = known.get(name, [])
            if len(types) != 1:
                results.append({"topic": name, "ok": False, "detail": "missing or ambiguous ROS message type"})
                continue
            dtype = types[0]
            try:
                # Other browser clients may already share this ROS subscription.
                if name not in self.topic_types:
                    await asyncio.to_thread(self.source.start_topic, name, dtype, self.broadcast_preview)
                    self.topic_types[name] = dtype
                state.active.add(name)
                results.append({"topic": name, "ok": True, "detail": "ROS subscriber created; waiting for messages", "type": dtype})
            except Exception as exc:
                results.append({"topic": name, "ok": False, "detail": str(exc)[:230]})
        self.queue(state, {"op": "subscribe_result", "results": results, "active": sorted(state.active)})

    async def unsubscribe(self, state: Client, requested: Any):
        names = list(state.active) if requested == "all" else requested if isinstance(requested, list) else []
        removed = []
        for name in names:
            if name not in state.active:
                continue
            state.active.remove(name)
            removed.append(name)
            if not any(name in other.active for other in self.clients.values()):
                await asyncio.to_thread(self.source.stop_topic, name)
                self.topic_types.pop(name, None)
                self.forward_at.pop(name, None)
        self.queue(state, {"op": "unsubscribe_result", "removed": removed, "active": sorted(state.active)})

    async def handle(self, ws: Any):
        state = Client(ws)
        self.clients[ws] = state
        sender = asyncio.create_task(self.writer(state))
        try:
            async for raw in ws:
                try:
                    req = json.loads(raw)
                except (TypeError, ValueError):
                    self.queue(state, {"op": "error", "message": "expected JSON"})
                    continue
                if not isinstance(req, dict):
                    continue
                op = req.get("op")
                if not state.authorized:
                    if op != "hello" or req.get("protocol") != PROTOCOL:
                        self.queue(state, {"op": "error", "message": "hello / protocol is required"})
                        await ws.close(code=1008, reason="hello required")
                        break
                    provided = req.get("token") if isinstance(req.get("token"), str) else ""
                    if self.token and not hmac.compare_digest(provided, self.token):
                        self.queue(state, {"op": "error", "message": "invalid token"})
                        await ws.close(code=1008, reason="unauthorized")
                        break
                    state.authorized = True
                    self.queue(state, {
                        "op": "hello", "ok": True, "protocol": PROTOCOL,
                        "source": "DEMO" if self.demo else "ROS2", "readonly": True,
                        "domain_id": os.environ.get("ROS_DOMAIN_ID", "0"),
                        "max_topics": MAX_TOPICS,
                    })
                    await self.on_graph(state)
                elif op == "graph":
                    await self.on_graph(state)
                elif op == "subscribe":
                    await self.subscribe(state, req.get("topics"))
                elif op == "unsubscribe":
                    await self.unsubscribe(state, req.get("topics"))
                elif op == "ping":
                    self.queue(state, {"op": "pong", "time": time.time()})
                else:
                    self.queue(state, {"op": "error", "message": "unsupported read-only operation"})
        finally:
            try:
                await self.unsubscribe(state, "all")
            except Exception:
                pass
            self.clients.pop(ws, None)
            sender.cancel()
            try:
                await sender
            except asyncio.CancelledError:
                pass

    async def demo_feeder(self):
        step = 0
        while True:
            await asyncio.sleep(.2)
            step += 1
            # Demo messages are deliberately conspicuously fake, not real lat/lon.
            examples = {
                "/demo/gnss/fix": {"header": {"frame_id": "DEMO_NOT_REAL"}, "latitude": 0.0, "longitude": 0.0, "altitude": 0.0, "status": {"status": -1}},
                "/demo/odometry": {"header": {"frame_id": "DEMO_ODOM"}, "pose": {"pose": {"position": {"x": round(step*.02, 2), "y": 0.0, "z": 0.0}}}},
                "/demo/imu": {"angular_velocity": {"z": round(math.sin(step*.05), 3)}, "linear_acceleration": {"x": 0.0}},
                "/demo/status": {"data": "DEMO ONLY — no ROS2 connection"},
            }
            for topic in self.topic_types:
                if topic in examples:
                    self.broadcast_preview(topic, self.source.publishers[topic], examples[topic])


async def main_async(args):
    if args.host not in ("127.0.0.1", "localhost", "::1") and not args.token:
        raise RuntimeError("LAN binding requires --token; never expose this read-only bridge to the public Internet")
    source = DemoGraph() if args.demo else RealROS2()
    bridge = ReceiverServer(source, args.token or "", args.demo)
    bridge.loop = asyncio.get_running_loop()
    mode = "DEMO (NO ROS2)" if args.demo else "REAL ROS2"
    print("AGV_ROS2_RECEIVER = " + mode, flush=True)
    print(f"WEBSOCKET = ws://{args.host}:{args.port}", flush=True)
    print("PROTOCOL = " + PROTOCOL, flush=True)
    print("ROS_DOMAIN_ID = " + os.environ.get("ROS_DOMAIN_ID", "0"), flush=True)
    print("READ_ONLY = true", flush=True)
    print("TOKEN_REQUIRED = " + str(bool(args.token)).lower(), flush=True)
    try:
        async with serve(bridge.handle, args.host, args.port, max_size=128 * 1024, compression=None, ping_interval=20):
            if args.demo:
                feeder = asyncio.create_task(bridge.demo_feeder())
            try:
                await asyncio.Future()
            finally:
                if args.demo:
                    feeder.cancel()
    finally:
        source.shutdown()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1", help="loopback by default; LAN address requires --token")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--token", default="", help="shared secret; required on LAN (do not expose server to Internet)")
    parser.add_argument("--demo", action="store_true", help="synthetic topics, never connects to ROS2")
    args = parser.parse_args()
    try:
        asyncio.run(main_async(args))
    except KeyboardInterrupt:
        print("Stopped.")
    except Exception as exc:
        print("ERROR: " + str(exc), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
