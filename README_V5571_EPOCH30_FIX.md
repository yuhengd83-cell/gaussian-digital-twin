# AGV v5.5.7.1 — epoch_30 SPZ 地理参考模型身份修正版（本地使用）

## 问题根因

旧版把 ``park2_splat.ply`` (918,596 Gaussians) 当成了地理参考的匹配目标；但用户声明 Mesh 导出的 ``metadata.xml`` / ``tileset.json`` 关联的是 ``2026-10-15_10-31-41_3DGS_epoch_30.spz``，实际该 SPZ 含 1,739,253 个高斯、大小 29,254,747 bytes，SHA-256 ``e332130c5c8ae17babcf013d135108e63146f3115ede3509d8d9cb23ea5f1f13``。因此旧版数量检查拒绝了正确的 SPZ，又可能将参考原点套用到另一个 park2 PLY，这是错误的模型来源关系。

## 修复方案

1. ``config/scenes.json`` 将 ``epoch30_20261015`` 设置为默认模型。原来的 ``park2_splat.ply`` 和 ``office2`` 保留为独立场景。
2. 新增 ``models/2026-10-15_10-31-41_3DGS_epoch_30.spz``，直接使用用户上传的原始 SPZ，避免重复手动选择或重导出。
3. 新增 ``config/epoch30_georeference.json``；仅当载入字节长度、高斯数量、SPZ SHA-256 三项全部与归档模型一致后，地理模块才读取该地理参考文件。不依赖文件名/模糊场景名判断。
4. 不给 park2 PLY 套用 epoch_30 经纬度；不修改车辆运动学及 3DGS 渲染器。
5. 仅打开参考信息还不足以显示 AGV 经纬度。必须完成 Viewer↔Mesh 4+组拟合点和至少1组独立检查点，经实际残差检验后才能启用虚拟坐标。

## 安装（覆盖现有 v5.5.7 工程）

建议先完整复制你当前 v5.5.7 的项目目录作为备份，然后将此包的文件夹内容合并到备份副本的**根目录**，覆盖同名 ``agv-test.html`` 和 ``src/geo-panel.mjs``。保留原 ``assets``、``models/park2_splat.ply``、Ackermann GLB 和原版 ``index.html``。本包已经包含 epoch_30 SPZ，不需要再复制一次。

双击旧有 ``start_agv_v55_7_local.bat``，保持 CMD 窗口打开，访问：

``http://127.0.0.1:8102/agv-test.html?v=5.5.7.1``

## 验收

- 入口应默认加载 ``2026-10-15_10-31-41_3DGS_epoch_30.spz``（29,254,747 bytes），而不是 park2 PLY。
- 「经纬度」面板应显示“SPZ SHA-256 已通过；Mesh 地理参考已读取 · 待配准”。此时车辆经纬度仍显示“未配准”。
- 切换到 ``park2_splat.ply`` 后，坐标面板必须显示身份核验未通过，不得沿用 epoch_30 的参考原点或车辆位置。
- 如果重复手动选择本地同一 SPZ 且字节内容未改变，仍可通过 SHA-256 核验；但浏览器将视它为不同场景 ID，旧路点/车辆姿态不会自动跨 ID 迁移。
- 回到自动加载的 epoch_30 时，车辆可能需要重新校准显示比例和位置；不可将此前 park2 的车辆标定直接视为有效。

## 地理参考事实与边界

- ``metadata.xml`` 声明 WGS84 / UTM 50N (EPSG:32650 promoted to 3D), SRSOrigin: (416686.377487726, 4397342.391125577, 40.822100639)。
- ``tileset.json`` 提供 Mesh 局部 XYZ → ECEF 4x4 变换。
- 由模型文件标注计算的参考原点：经度 116.027910858°E、纬度 39.721892119°N、椭球高 40.8221m。
- 这不等于已经独立核实的现场 GPS。即便是同一采集批次，**SPZ Viewer XYZ ↔ Mesh XYZ 的空间变换仍需独立配准**；哈希只证明所载文件恰好是本次归档的源 SPZ，不证明空间坐标一致。

## 控制点建议

使用同一固定物理特征（建筑门框角、台阶角、墙角等），分别获取 SPZ Viewer XYZ 和 Mesh 原始 XYZ。选取至少4组空间分布良好的拟合点及1–2组独立检查点，不能用同一个点既拟合又验证；若没有共同可对应的精确坐标，应保持“未配准”。

## 检查命令

````powershell
Get-Item .\models\2026-10-15_10-31-41_3DGS_epoch_30.spz | Select-Object Name,Length
Test-Path .\config\epoch30_georeference.json
node .\tests\test_geo_registration.mjs
````

重要：本地修复包**没有**提交 GitHub，也不应将 29MB SPZ 误当成原会议室模型覆盖 ``models/splat.spz``。
