#!/usr/bin/env bash
# ROS2 Humble on Ubuntu 22.04. Run on the computer that can see ROS2 topics.
# Keep 'nounset' disabled while sourcing ROS-generated setup files, since
# these may read optional variables before initializing them.
set -eo pipefail

source /opt/ros/humble/setup.bash
if [[ -n "${ROS_WS_SETUP:-}" ]]; then
  if [[ ! -f "$ROS_WS_SETUP" ]]; then
    echo "ROS_WS_SETUP missing: $ROS_WS_SETUP" >&2
    exit 2
  fi
  source "$ROS_WS_SETUP"
fi

# Restore strict variable checking for the bridge launcher itself.
set -u
export ROS_DOMAIN_ID="${ROS_DOMAIN_ID:-1}"
BIND="${ROS_BRIDGE_BIND:-127.0.0.1}"
PORT="${ROS_BRIDGE_PORT:-8765}"
TOKEN="${ROS_BRIDGE_TOKEN:-}"
if ! python3 -c 'import rclpy, websockets, rosidl_runtime_py' >/dev/null 2>&1; then
  echo "ERROR: ROS2 Python modules or websockets missing."
  echo "Try: sudo apt install python3-websockets (using ROS2 system Python)."
  echo "For custom message types, source your workspace's install/setup.bash."
  exit 2
fi
ARGS=(--host "$BIND" --port "$PORT")
if [[ -n "$TOKEN" ]]; then ARGS+=(--token "$TOKEN"); fi
exec python3 "$(dirname "$0")/ros2_receiver_bridge.py" "${ARGS[@]}"
