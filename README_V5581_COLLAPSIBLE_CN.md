# AGV Metric Gaussian Digital Twin — v5.5.8.1 顶部功能栏可折叠版

## 使用范围
本版以 v5.5.8 为基础，仅调整顶部工具栏的显示和折叠控制；保留底层 v5.5.7.2 驾驶、模型加载、彩色轨迹、俯视地图及地理参考逻辑。**没有上传 GitHub。**

## 一、启动
1. 推荐把完整包解压到一个全新文件夹；不要覆盖已经验收的 v5.5.8。
2. Windows 双击 `start_agv_v55_8_1_local.bat`，保持 CMD / PowerShell 窗口打开。
3. 程序检查 epoch_30 SPZ 的大小和 SHA-256 后，以 127.0.0.1:8105 提供页面。
4. 打开 http://127.0.0.1:8105/agv-test.html?v=5.5.8.1&scene=epoch30_20261015
5. 如果端口占用，关闭旧的 8105 服务器。不要误启动旧版 8104 的脚本。

## 二、操作
- 顶部始终显示「场景导航 / 视图工具 / 模型与仿真 / 地图与应用」四个一级分组。
- 右侧 `▾`：当前展开，点击收起本组的子按钮。
- 右侧 `▸`：当前收起，点击展开本组的子按钮。
- 四组相互独立；收起子按钮不会关闭已经打开的驾驶、经纬度等右侧工具面板。
- 桌面首次打开：全部展开；窄屏（宽度不大于 760px）首次打开：全部收起。
- 每次点击后的状态保存在浏览器的 localStorage（key：`agv-toolbar-v5581-collapsed`）。
- 如需重置全部展开/收起记录：在当前网页的 F12 控制台运行 `localStorage.removeItem('agv-toolbar-v5581-collapsed');location.reload()`，或清理此站点的本地存储。

## 三、配置文件
你提供的五个 JSON 作为原始文件原样保存在 config/：
- ackermann_placement_epoch30_20261015.json
- ackermann_placement_park2_rear_20261019.json
- epoch30_georeference.json
- epoch30_viewer_mesh_registration_v5571.json
- scenes.json

新增/更新 `config/ui_toolbar.json`：控制四组名称、默认展开状态、主题色与窄屏默认折叠策略。注意浏览器运行时修改不会自动回写配置文件；用户选择由 localStorage 单独保存。

## 四、重要科学与工程边界
- `epoch30_viewer_mesh_registration_v5571.json` 是历史固定参考平面取点的平面配准方案，不能据此宣称完成严格三维精度验证。
- 网页中显示的经纬度来自 Mesh 地理参考及模型坐标变换估计，并非实时 GNSS/RTK/ROS 定位。
- 本版没有新增真实表面深度拾取、避障、碰撞检测或真实 AGV 控制能力。

## 五、回归检查
命令行进入工程目录后：
```
node tests/test_v5581_toolbar.cjs
node tests/test_ackermann_kinematics.cjs
node tests/test_v5572_default.cjs
```
工具栏的按钮、分组、aria-expanded、localStorage 记忆与窄屏折叠已经完成独立 HTML 浏览器测试。完整 Three.js/Spark 渲染及你本机 Windows 互动仍需要本机验收。

## 六、升级说明
轻量更新包不包含大型 SPZ、PLY 和 GLB。它适合覆盖到 v5.5.8 的**副本**中；全新安装请选择完整包。
