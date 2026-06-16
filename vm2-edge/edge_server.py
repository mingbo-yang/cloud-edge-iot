import threading
import time
from collections import defaultdict
from datetime import datetime, timezone

import requests
from flask import Flask, jsonify, request

import config

app = Flask(__name__)

# 数据缓冲池: {device_id: [data, ...]}
buffer = defaultdict(list)
buffer_lock = threading.Lock()


def check_anomaly(data: dict) -> tuple[bool, str | None]:
    """检测数据是否异常，返回 (是否异常, 异常原因)"""
    reasons = []

    if data["pm25"] > config.PM25_THRESHOLD:
        reasons.append(f"PM2.5({data['pm25']}) > {config.PM25_THRESHOLD}")
    if data["temperature"] > config.TEMP_THRESHOLD:
        reasons.append(f"温度({data['temperature']}) > {config.TEMP_THRESHOLD}")

    if reasons:
        return True, "; ".join(reasons)
    return False, None


def forward_to_cloud(data: dict) -> bool:
    """转发数据到云端，返回是否成功"""
    try:
        resp = requests.post(
            config.CLOUD_ENDPOINT,
            json=data,
            timeout=5,
        )
        return resp.status_code == 200
    except requests.RequestException as e:
        print(f"[转发云端失败] {e}")
        return False


@app.route("/api/data", methods=["POST"])
def receive_data():
    """接收终端数据，进行异常检测，缓冲聚合"""
    data: dict = request.get_json(force=True)
    device_id = data.get("device_id", "unknown")

    is_anomaly, anomaly_reason = check_anomaly(data)

    data["anomaly"] = is_anomaly
    data["anomaly_reason"] = anomaly_reason
    data["edge_timestamp"] = datetime.now(timezone.utc).isoformat()

    # 打印接收日志
    status = "异常" if is_anomaly else "正常"
    print(f"[接收] {status} | {device_id} | "
          f"温度={data['temperature']} "
          f"PM2.5={data['pm25']} "
          f"{f'原因: {anomaly_reason}' if is_anomaly else ''}")

    if is_anomaly:
        # 异常数据立即转发
        if forward_to_cloud(data):
            print(f"[异常转发] {device_id} → 云端")
    else:
        # 正常数据加入缓冲池等待聚合
        with buffer_lock:
            buffer[device_id].append(data)

    return jsonify({"status": "ok", "anomaly": is_anomaly})


def aggregate_and_forward():
    """定时聚合线程：每AGGREGATE_WINDOW秒计算平均值并转发"""
    while True:
        time.sleep(config.AGGREGATE_WINDOW)

        with buffer_lock:
            if not buffer:
                continue

            aggregated = {}
            # 快照并清空缓冲区
            for device_id, records in buffer.items():
                if not records:
                    continue
                n = len(records)
                agg = {
                    "device_id": device_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "temperature": round(sum(r["temperature"] for r in records) / n, 1),
                    "humidity": round(sum(r["humidity"] for r in records) / n, 1),
                    "pm25": round(sum(r["pm25"] for r in records) / n, 1),
                    "co2": round(sum(r["co2"] for r in records) / n, 1),
                    "anomaly": False,
                    "anomaly_reason": None,
                    "edge_timestamp": datetime.now(timezone.utc).isoformat(),
                    "aggregated": True,
                    "aggregate_count": n,
                }
                aggregated[device_id] = agg

            buffer.clear()

        # 发送聚合数据
        for device_id, agg in aggregated.items():
            if forward_to_cloud(agg):
                print(f"[聚合转发] {device_id} | {agg['aggregate_count']}条平均 "
                      f"温度={agg['temperature']} PM2.5={agg['pm25']}")
            else:
                print(f"[聚合转发失败] {device_id}")


def main():
    # 启动聚合线程
    t = threading.Thread(target=aggregate_and_forward, daemon=True)
    t.start()

    print(f"边缘节点启动: 0.0.0.0:{config.EDGE_PORT}")
    print(f"异常阈值: PM2.5>{config.PM25_THRESHOLD}, 温度>{config.TEMP_THRESHOLD}")
    print(f"聚合窗口: {config.AGGREGATE_WINDOW}s, 云端地址: {config.CLOUD_ENDPOINT}")

    app.run(host=config.EDGE_HOST, port=config.EDGE_PORT, debug=False)


if __name__ == "__main__":
    main()
