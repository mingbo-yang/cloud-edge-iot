import os

# 终端模拟配置
DEVICE_COUNT = int(os.environ.get("DEVICE_COUNT", 3))
SAMPLE_INTERVAL = int(os.environ.get("SAMPLE_INTERVAL", 5))  # 秒

# VM2 边缘节点地址（Docker Compose 下用服务名，直接部署用 IP）
EDGE_URL = os.environ.get("EDGE_URL", "http://vm2-edge:5000")
EDGE_ENDPOINT = f"{EDGE_URL}/api/data"

# 环境数据生成范围
TEMP_RANGE = (15.0, 40.0)
HUMIDITY_RANGE = (30.0, 90.0)
PM25_RANGE = (10.0, 80.0)
CO2_RANGE = (300.0, 600.0)
