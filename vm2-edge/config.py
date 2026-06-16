import os

# 边缘服务配置
EDGE_HOST = os.environ.get("EDGE_HOST", "0.0.0.0")
EDGE_PORT = int(os.environ.get("EDGE_PORT", 5000))

# VM3 云端地址
CLOUD_URL = os.environ.get("CLOUD_URL", "http://vm3-cloud:5000")
CLOUD_ENDPOINT = f"{CLOUD_URL}/api/data"

# 异常检测阈值
PM25_THRESHOLD = float(os.environ.get("PM25_THRESHOLD", 50))
TEMP_THRESHOLD = float(os.environ.get("TEMP_THRESHOLD", 38))

# 聚合配置
AGGREGATE_WINDOW = int(os.environ.get("AGGREGATE_WINDOW", 30))  # 秒
