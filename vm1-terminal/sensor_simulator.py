import random
import threading
import time
from datetime import datetime, timezone

import requests

import config


def generate_sensor_data(device_id: str) -> dict:
    """生成一组随机环境监测数据"""
    return {
        "device_id": device_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "temperature": round(random.uniform(*config.TEMP_RANGE), 1),
        "humidity": round(random.uniform(*config.HUMIDITY_RANGE), 1),
        "pm25": round(random.uniform(*config.PM25_RANGE), 1),
        "co2": round(random.uniform(*config.CO2_RANGE), 1),
    }


def send_data(device_id: str, data: dict) -> bool:
    """发送数据到边缘节点，返回是否成功"""
    try:
        resp = requests.post(
            config.EDGE_ENDPOINT,
            json=data,
            timeout=5,
        )
        return resp.status_code == 200
    except requests.RequestException as e:
        print(f"[{device_id}] 发送失败: {e}")
        return False


def device_loop(device_id: str):
    """单个终端设备的主循环"""
    print(f"[{device_id}] 启动, 采集间隔={config.SAMPLE_INTERVAL}s, "
          f"目标={config.EDGE_ENDPOINT}")

    while True:
        data = generate_sensor_data(device_id)
        ok = send_data(device_id, data)

        status = "OK" if ok else "FAIL"
        print(
            f"[{device_id}] {status} | "
            f"温度={data['temperature']}°C "
            f"湿度={data['humidity']}% "
            f"PM2.5={data['pm25']} "
            f"CO2={data['co2']}"
        )

        time.sleep(config.SAMPLE_INTERVAL)


def main():
    print(f"启动 {config.DEVICE_COUNT} 个终端模拟器")
    threads = []

    for i in range(config.DEVICE_COUNT):
        device_id = f"sensor_{i + 1:02d}"
        t = threading.Thread(target=device_loop, args=(device_id,), daemon=True)
        t.start()
        threads.append(t)

    for t in threads:
        t.join()


if __name__ == "__main__":
    main()
