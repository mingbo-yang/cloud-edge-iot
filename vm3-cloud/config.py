import os

# 云端服务配置
CLOUD_HOST = os.environ.get("CLOUD_HOST", "0.0.0.0")
CLOUD_PORT = int(os.environ.get("CLOUD_PORT", 5000))

# 数据库路径
DATABASE_PATH = os.environ.get("DATABASE_PATH", "data/iot_data.db")
