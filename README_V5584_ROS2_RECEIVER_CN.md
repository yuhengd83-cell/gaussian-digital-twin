# v5.5.8.4｜AGV 黄色车载盒 ROS2 话题接收（只读阶段）

## 本次完成的功能和边界

本版以本机已经验收的 v5.5.8.3 作为基础，不更改 3DGS 模型、Ackermann CAD 几何、车辆初始位置、驾驶仿真、彩色轨迹、地理配准和可拖动小地图。顶部的 **模型与仿真 → ROS2 接收** 新增一块接收面板，黄色盒子对应接收设备的**语义标识**，不是已核实的 CAD 电气连接和真实传感器位姿。

- 可连接 ROS2 电脑上的只读 WebSocket 桥接服务。
- 可刷新 ROS2 图：发现当前话题名称/消息类型/发布者数量、节点名称/命名空间、节点发布与订阅关系。
- 在话题列表点击复选框多选，按「订阅选中」创建真实 ROS2 订阅器；每个话题分别返回成功/失败信息。
- 消息选项卡显示最新 JSON 摘要、已接收条数、桥接转发后的速率；可以单独取消或全部取消订阅。
- 连接断开时清空订阅态，刷新和重新连接后需重新选择订阅。
- 不读取未选中的话题消息；不发布 ROS2 消息、不调用服务、不控制车轮或 AGV 位姿、不做 ROS `map` → 3DGS 坐标转换。

**重要区别：**「订阅成功」只表示创建了订阅者，不保证存在正在发布的消息。收到实时消息后，`消息` 标签内才会出现新的数据。

## 软件端关系

```text
ROS2 Publisher (Ubuntu 22.04, Humble, ROS_DOMAIN_ID 与目标一致)
             │ DDS
             ▼
rclpy 只读桥接节点 tools/ros2_receiver_bridge.py
             │ WebSocket (默认 ws://127.0.0.1:8765)
             ▼
Windows 浏览器 AGV v5.5.8.4 (http://127.0.0.1:8108)
             ├── 节点与话题发现
             ├── 多选订阅 + 消息浏览
             └── 黄色接收盒语义标识（不驱动车辆）
```

桥接使用项目自定义的 `agv-ros2-sub-v1` 只读协议，**不兼容 rosbridge v2 协议**。不要把 `ws://...:9090` 的 rosbridge 地址直接填入本面板。该阶段没有 ROS 端生产者，只有订阅者和图发现。

## 一、启动 Windows 网页

1. 解压完整包到新文件夹（不要覆盖 v5.5.8.3）。
2. 双击 `start_agv_v55_8_4_local.bat`，保留控制台窗口。
3. 浏览器打开 `http://127.0.0.1:8108/agv-test.html?v=5.5.8.4&scene=epoch30_20261015`。
4. 顶部「模型与仿真 ▸」→「ROS2 接收」，打开接收面板。

仅启动网页不会自动连上 ROS2；ROS2 桥接必须在运行 ROS2 的电脑上独立启动。

## 二、Ubuntu ROS2 Humble 桥接

将本工程 `tools/ros2_receiver_bridge.py` 和 `tools/start_ros2_receiver_ubuntu.sh` 放在同一个目录（完整工程已包含）。

在 Ubuntu 上：

```bash
source /opt/ros/humble/setup.bash
# 如需自定义消息，例如 Livox，请先 source 对应工作空间
# source /data/your_ros2_ws/install/setup.bash
export ROS_DOMAIN_ID=1        # 改成你的系统实际 ROS_DOMAIN_ID
python3 -c 'import rclpy, websockets, rosidl_runtime_py; print("READY")'
bash tools/start_ros2_receiver_ubuntu.sh
```

如果出现 websockets 缺失，可尝试 Ubuntu 的 `sudo apt install python3-websockets`；请选择与 `rclpy` 所在 ROS Python 解释器一致的安装方式，**不要直接替换系统 Python**。桥接默认只监听 Ubuntu 的 `127.0.0.1:8765`，适合网页也在同一台机器上运行。

### Windows 网页与 Ubuntu ROS2 是两台电脑时

需要先确认 Windows 能访问 Ubuntu 的 LAN IP，例如 `172.16.20.112` **仅作为示例**，实际请以 Ubuntu 执行 `hostname -I` 的结果为准。

在 Ubuntu 的可信内网环境下：

```bash
export ROS_DOMAIN_ID=1
export ROS_BRIDGE_BIND=0.0.0.0
export ROS_BRIDGE_PORT=8765
export ROS_BRIDGE_TOKEN='请替换成你生成的足够长的随机令牌'
bash tools/start_ros2_receiver_ubuntu.sh
```

程序要求：监听非回环地址时必须填写令牌，否则拒绝启动。把 Windows 网页中的地址改成 `ws://<Ubuntu-LAN-IP>:8765`，输入同一令牌，再点「连接桥接」。不要在公网开放该端口；只允许可信终端访问，按需要在 Ubuntu 防火墙限制来源 IP。若网页部署在 HTTPS 域名，必须使用经 TLS 保护的 `wss://` 桥接服务，当前本地包未配置公网反向代理。

### 检查 ROS2 图发现

Ubuntu 开另一终端运行：

```bash
source /opt/ros/humble/setup.bash
export ROS_DOMAIN_ID=1
ros2 node list
ros2 topic list -t
```

假设你有一个测试数据发布者，可以用：

```bash
ros2 topic pub -r 1 /agv/ros2_test std_msgs/msg/String "{data: 'hello from ROS2'}"
```

网页「刷新节点/话题」后，会出现 `/agv/ros2_test`。勾选它，点击「订阅选中」；跳转「接收消息」，就能看到 `data` 内容更新。GNSS、IMU、里程计同理，前提是对应接口包可以在桥接进程的环境中 import。

## 三、完全不启动 ROS2 的演示联调（只测试 UI）

在已安装 Python 和 `websockets` 的电脑运行：

```powershell
python tools/ros2_receiver_bridge.py --demo
```

或者 Windows 双击 `tools/start_ros2_demo.bat`。浏览器仍连接 `ws://127.0.0.1:8765`，来源标为 **DEMO（非 ROS2）**。示例话题 `/demo/gnss/fix`、`/demo/odometry` 等包含明确虚构数据，不能用作定位或运动验收。

## 四、重要使用说明

- 桥接上限为每个浏览器同时 12 个订阅话题，约 6.25 条/秒/话题的转发上限；界面显示的速率不是原始 ROS2 发布速率。
- 对 `sensor_msgs/Image`、`PointCloud2` 等巨型二进制数据只展示字段与长度摘要，**不会上传图像帧或点云本体**。
- 采用 `BEST_EFFORT/VOLATILE` 的读取策略以便订阅常见传感器话题；`/tf_static` 请求 `RELIABLE/TRANSIENT_LOCAL`。极端自定义 QoS 可能不匹配，后续可以增加 QoS 选择器。
- 若 `ros2 topic list` 与网页列表不同，确认 `ROS_DOMAIN_ID`、网络组播、DDS 配置、工作空间是否已 source、自定义 message 包能否导入。
- 当前地理坐标仍是旧版 **SPZ–Mesh 模型推算**；ROS2 GNSS 只显示在接收面板中，不会覆盖它，也不会启动车辆。
- 配置：`config/ros2_receiver.json`。令牌不会写入文件或本地存储，输入后只在本次连接握手中使用。
- 不含后续功能：ROS2 位姿和小车位置绑定、TF 坐标转换、话题录制、远程小车控制、实时 ROS map 对齐。

## 五、验收清单

1. 页面顶部「模型与仿真」中出现「ROS2 接收」。
2. 断开状态不会伪造话题，也不会伪造已经订阅成功的状态。
3. 启动真实桥接或 DEMO，连接后看到 `已连接 ROS2` 或 `演示数据`（明显区分）。
4. 节点和话题列表都正常，复选框可多选。
5. 「订阅选中」后对应话题标记已订阅；「接收消息」显示收到的数据与序号。
6. 「取消选中订阅」「全部取消」有效，断开时面板显示未连接。
7. 在进行上述操作期间，原 3DGS、驾驶、经纬度面板及小地图不受影响。

## 验证状态

Python 语法、JavaScript 语法、演示 WebSocket 端到端通信和浏览器 UI 可进行本地自动测试。**当前交付环境没有安装 ROS2 Humble/rclpy，因此无法证明真实 DDS 订阅已经在你的 Ubuntu 上运行成功；这一步必须由你本机按上面步骤验收。**
