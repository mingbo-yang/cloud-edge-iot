import os
import sqlite3
from datetime import datetime, timezone

from flask import Flask, g, jsonify, render_template, request

import config

app = Flask(__name__)


def get_db() -> sqlite3.Connection:
    """获取数据库连接"""
    db = getattr(g, "_database", None)
    if db is None:
        os.makedirs(os.path.dirname(config.DATABASE_PATH), exist_ok=True)
        db = g._database = sqlite3.connect(
            config.DATABASE_PATH, detect_types=sqlite3.PARSE_DECLTYPES
        )
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA journal_mode=WAL")
    return db


@app.teardown_appcontext
def close_db(exception):
    db = getattr(g, "_database", None)
    if db is not None:
        db.close()


def init_db():
    """初始化数据库表"""
    db_dir = os.path.dirname(config.DATABASE_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    db = sqlite3.connect(config.DATABASE_PATH)
    db.execute("""
        CREATE TABLE IF NOT EXISTS sensor_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            temperature REAL,
            humidity REAL,
            pm25 REAL,
            co2 REAL,
            anomaly INTEGER DEFAULT 0,
            anomaly_reason TEXT,
            aggregated INTEGER DEFAULT 0,
            aggregate_count INTEGER,
            edge_timestamp TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    db.execute("""
        CREATE INDEX IF NOT EXISTS idx_device_timestamp
        ON sensor_data(device_id, timestamp DESC)
    """)
    db.commit()
    db.close()


@app.route("/api/data", methods=["POST"])
def receive_data():
    """接收边缘数据，存入数据库"""
    data: dict = request.get_json(force=True)
    db = get_db()

    db.execute(
        """
        INSERT INTO sensor_data
            (device_id, timestamp, temperature, humidity, pm25, co2,
             anomaly, anomaly_reason, aggregated, aggregate_count, edge_timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data.get("device_id"),
            data.get("timestamp"),
            data.get("temperature"),
            data.get("humidity"),
            data.get("pm25"),
            data.get("co2"),
            int(data.get("anomaly", False)),
            data.get("anomaly_reason"),
            int(data.get("aggregated", False)),
            data.get("aggregate_count"),
            data.get("edge_timestamp"),
        ),
    )
    db.commit()

    is_anomaly = data.get("anomaly")
    is_agg = data.get("aggregated")
    device_id = data.get("device_id")
    tag = "异常" if is_anomaly else ("聚合" if is_agg else "正常")
    print(f"[存储] {tag} | {device_id}")

    return jsonify({"status": "ok"})


@app.route("/api/data/latest")
def get_latest_data():
    """返回各设备最新N条数据"""
    db = get_db()
    limit = request.args.get("limit", 100, type=int)
    device = request.args.get("device", None)

    query = "SELECT * FROM sensor_data"
    params = []

    if device:
        query += " WHERE device_id = ?"
        params.append(device)

    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    rows = db.execute(query, params).fetchall()
    result = [dict(row) for row in rows]
    return jsonify(result)


@app.route("/api/devices")
def get_devices():
    """返回所有设备ID列表"""
    db = get_db()
    rows = db.execute(
        "SELECT DISTINCT device_id FROM sensor_data ORDER BY device_id"
    ).fetchall()
    return jsonify([row["device_id"] for row in rows])


@app.route("/api/stats")
def get_stats():
    """返回统计摘要"""
    db = get_db()
    stats = {}

    # 设备数量和数据总量
    row = db.execute(
        "SELECT COUNT(DISTINCT device_id) as devices, COUNT(*) as total "
        "FROM sensor_data"
    ).fetchone()
    stats["device_count"] = row["devices"] or 0
    stats["total_records"] = row["total"] or 0

    # 异常数据量
    row = db.execute(
        "SELECT COUNT(*) as anomalies FROM sensor_data WHERE anomaly = 1"
    ).fetchone()
    stats["anomaly_count"] = row["anomalies"] or 0

    # 聚合上报数量
    row = db.execute(
        "SELECT COUNT(*) as aggs FROM sensor_data WHERE aggregated = 1"
    ).fetchone()
    stats["aggregate_count"] = row["aggs"] or 0

    # 各设备最新值
    devices = db.execute(
        "SELECT DISTINCT device_id FROM sensor_data ORDER BY device_id"
    ).fetchall()
    latest = {}
    for d in devices:
        row = db.execute(
            "SELECT * FROM sensor_data WHERE device_id = ? "
            "ORDER BY created_at DESC LIMIT 1",
            (d["device_id"],),
        ).fetchone()
        if row:
            r = dict(row)
            latest[d["device_id"]] = {
                "temperature": r["temperature"],
                "humidity": r["humidity"],
                "pm25": r["pm25"],
                "co2": r["co2"],
                "anomaly": r["anomaly"],
                "timestamp": r["timestamp"],
            }
    stats["latest"] = latest

    return jsonify(stats)


@app.route("/")
def dashboard():
    """仪表盘首页"""
    return render_template("dashboard.html")


def main():
    init_db()
    print(f"云端平台启动: 0.0.0.0:{config.CLOUD_PORT}")
    print(f"数据库: {config.DATABASE_PATH}")
    app.run(host=config.CLOUD_HOST, port=config.CLOUD_PORT, debug=False)


if __name__ == "__main__":
    main()
