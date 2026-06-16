# 边-云协同 IoT 智能环境监测系统

> **Edge–Cloud Collaborative IoT Environmental Monitoring System**
>
> A lightweight, 3-tier IoT demo that simulates the **device → edge → cloud** data pipeline.
> **VM1** spawns multi-threaded virtual sensors that emit JSON readings (temperature / humidity / PM2.5 / CO₂) over HTTP;
> **VM2** is an edge node that performs real-time anomaly detection (PM2.5 > 50 or temp > 38) and time-window aggregation before forwarding;
> **VM3** is the cloud platform that stores data in SQLite and serves a real-time, dark-themed **web dashboard** (Chart.js).
> Ships with per-service Dockerfiles and a one-command `docker compose` deployment. See [`部署指南.md`](部署指南.md) for full VM deployment steps.

![Dashboard](docs/dashboard.png)

## 系统架构

```
VM1 (终端模拟)          VM2 (边缘节点)          VM3 (云平台)
多线程生成传感器数据  →  异常检测 + 聚合转发  →  存储 + Web 仪表盘
HTTP POST / JSON        HTTP POST / JSON        Flask + SQLite + Chart.js
```

## 快速开始 (Docker Compose 一键部署)

```bash
# 在项目根目录执行
docker compose up -d

# 查看日志
docker compose logs -f

# 访问仪表盘: http://localhost:5000
```

## 分机部署 (三台 Ubuntu 虚拟机)

### 环境要求
- Python 3.10+
- pip

### VM3: 云端平台 (先启动)
```bash
cd vm3-cloud
pip install -r requirements.txt
python cloud_server.py
# 默认监听 0.0.0.0:5000
# 仪表盘地址: http://<VM3_IP>:5000
```

### VM2: 边缘节点
```bash
cd vm2-edge
pip install -r requirements.txt
# 修改 config.py 中的 CLOUD_URL 为 VM3 实际 IP
export CLOUD_URL=http://<VM3_IP>:5000
python edge_server.py
# 默认监听 0.0.0.0:5000
```

### VM1: 终端模拟器
```bash
cd vm1-terminal
pip install -r requirements.txt
# 修改 config.py 中的 EDGE_URL 为 VM2 实际 IP
export EDGE_URL=http://<VM2_IP>:5000
python sensor_simulator.py
```

## 配置参数 (环境变量)

| 变量 | 默认值 | 说明 |
|------|--------|------|
| DEVICE_COUNT | 3 | 模拟终端数量 |
| SAMPLE_INTERVAL | 5 | 采集间隔(秒) |
| PM25_THRESHOLD | 50 | PM2.5 异常阈值 |
| TEMP_THRESHOLD | 38 | 温度异常阈值 |
| AGGREGATE_WINDOW | 30 | 聚合窗口(秒) |

## 功能模块

- **VM1 终端模拟器**: 多线程模拟多个 IoT 设备，定时生成温度/湿度/PM2.5/CO2 数据，HTTP POST 发送至边缘节点
- **VM2 边缘预处理**: 接收终端数据，实时异常检测（PM2.5>50 或 温度>38），异常数据立即转发；正常数据每30秒聚合后转发云端
- **VM3 云端平台**: 接收并存储数据到 SQLite，提供 REST API，展示实时 Web 仪表盘（Chart.js 图表）
