const POLL_INTERVAL = 3000;
const MAX_POINTS = 60;

const DEVICE_PALETTE = [
  "#2563eb", "#0891b2", "#7c3aed", "#059669",
  "#d97706", "#dc2626", "#0f766e", "#9333ea",
  "#0284c7", "#be123c",
];

const METRIC_INFO = {
  temperature: { title: "温度 (°C)", short: "温度", unit: "°C" },
  humidity: { title: "湿度 (%)", short: "湿度", unit: "%" },
  pm25: { title: "PM2.5 (μg/m³)", short: "PM2.5", unit: "" },
  co2: { title: "CO2 (ppm)", short: "CO2", unit: "" },
};

const deviceColorMap = {};
let currentMetric = "temperature";
let currentDevice = null;
let chart = null;
let allData = [];

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function colorForDevice(devId) {
  if (!(devId in deviceColorMap)) {
    const idx = Object.keys(deviceColorMap).length % DEVICE_PALETTE.length;
    deviceColorMap[devId] = DEVICE_PALETTE[idx];
  }
  return deviceColorMap[devId];
}

function formatNumber(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return Number(value).toFixed(digits).replace(/\.0$/, "");
}

function metricText(value, metric) {
  const info = METRIC_INFO[metric];
  const n = formatNumber(value);
  if (n === "--") return "--";
  return `${n}${info.unit}`;
}

function animateNumber(el, target) {
  const from = parseInt(el.dataset.val || "0", 10);
  if (from === target) return;
  el.dataset.val = target;
  const start = performance.now();
  const dur = 520;

  function tick(now) {
    const p = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (target - from) * eased).toLocaleString();
    if (p < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function getNewestRecord(latest) {
  const records = Object.values(latest || {}).filter(Boolean);
  if (records.length === 0) return null;
  return records.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))[0];
}

function updateQualitySummary(stats) {
  const latest = stats?.latest || {};
  const newest = getNewestRecord(latest);
  const anomalyCount = stats?.anomaly_count || 0;
  const deviceCount = stats?.device_count || 0;

  if (!newest) {
    $("#qualityValue").textContent = "等待数据";
    $("#qualityNote").textContent = "等待终端接入并上报。";
    $("#latestTemp").textContent = "--";
    $("#latestPm25").textContent = "--";
    $("#latestHumidity").textContent = "--";
    $("#latestCo2").textContent = "--";
    return;
  }

  const isWarn = Boolean(newest.anomaly);
  $("#qualityValue").textContent = isWarn ? "需要关注" : "运行平稳";
  $("#qualityValue").style.color = isWarn ? "#dc2626" : "#059669";
  $("#qualityNote").textContent = isWarn
    ? `${newest.device_id || "最新设备"} 触发阈值告警。`
    : `${deviceCount} 个设备在线，累计 ${anomalyCount} 条异常。`;

  $("#latestTemp").textContent = metricText(newest.temperature, "temperature");
  $("#latestPm25").textContent = formatNumber(newest.pm25);
  $("#latestHumidity").textContent = metricText(newest.humidity, "humidity");
  $("#latestCo2").textContent = formatNumber(newest.co2);
}

function initChart() {
  Chart.defaults.color = "#64748b";
  Chart.defaults.font.family =
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif";

  const ctx = $("#mainChart").getContext("2d");
  chart = new Chart(ctx, {
    type: "line",
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 420, easing: "easeOutQuart" },
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: {
          position: "top",
          align: "start",
          labels: {
            usePointStyle: true,
            boxWidth: 8,
            boxHeight: 8,
            padding: 18,
            color: "#334155",
            font: { size: 12, weight: "600" },
          },
        },
        tooltip: {
          backgroundColor: "rgba(255, 255, 255, 0.96)",
          titleColor: "#0f172a",
          bodyColor: "#334155",
          borderColor: "rgba(15, 23, 42, 0.10)",
          borderWidth: 1,
          padding: 12,
          cornerRadius: 14,
          displayColors: true,
          boxPadding: 5,
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(100, 116, 139, 0.10)", drawBorder: false },
          ticks: { maxTicksLimit: 9, maxRotation: 0, color: "#94a3b8" },
          title: { display: false },
        },
        y: {
          beginAtZero: false,
          grid: { color: "rgba(100, 116, 139, 0.12)", drawBorder: false },
          ticks: { color: "#64748b" },
          title: {
            display: true,
            text: METRIC_INFO[currentMetric].title,
            color: "#64748b",
            font: { weight: "650" },
          },
        },
      },
    },
  });
}

function updateChart() {
  if (!chart) return;

  chart.options.scales.y.title.text = METRIC_INFO[currentMetric].title;
  $("#chartSubtitle").textContent = currentDevice
    ? `正在查看 ${currentDevice} 的 ${METRIC_INFO[currentMetric].short} 趋势`
    : `展示所有设备的 ${METRIC_INFO[currentMetric].short} 最新变化`;

  let filtered = allData;
  if (currentDevice) filtered = allData.filter((d) => d.device_id === currentDevice);

  const groups = {};
  filtered.forEach((d) => {
    if (!d.device_id) return;
    (groups[d.device_id] = groups[d.device_id] || []).push(d);
  });

  const datasets = [];
  const deviceIds = Object.keys(groups).sort();
  let longest = [];

  deviceIds.forEach((devId) => {
    const records = groups[devId]
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .slice(-MAX_POINTS);
    if (records.length === 0) return;
    if (records.length > longest.length) longest = records;

    const c = colorForDevice(devId);
    datasets.push({
      label: devId,
      data: records.map((r) => r[currentMetric]),
      borderColor: c,
      backgroundColor: hexToRgba(c, 0.10),
      borderWidth: 2.4,
      fill: true,
      pointRadius: records.map((r) => (r.anomaly ? 5 : 2.3)),
      pointHoverRadius: 6,
      pointBackgroundColor: records.map((r) => (r.anomaly ? "#dc2626" : "#fff")),
      pointBorderColor: records.map((r) => (r.anomaly ? "#dc2626" : c)),
      pointBorderWidth: records.map((r) => (r.anomaly ? 2 : 1.8)),
      tension: 0.38,
      spanGaps: true,
    });
  });

  chart.data.labels = longest.map((r) =>
    new Date(r.timestamp).toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  );
  chart.data.datasets = datasets;
  chart.update("none");
}

function renderDeviceCards(latest) {
  const box = $("#deviceCards");
  const entries = Object.entries(latest || {}).sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) {
    box.innerHTML = '<div class="empty">暂无设备数据</div>';
    return;
  }

  box.innerHTML = entries
    .map(([devId, d]) => {
      const c = colorForDevice(devId);
      const active = currentDevice === devId ? "active" : "";
      const warn = d.anomaly ? "warn" : "";
      const status = d.anomaly ? "异常" : "正常";
      return `
        <button class="device-card ${active}" data-device="${devId}" style="--dev-color:${c}" type="button">
          <div class="device-top">
            <div class="device-name"><span class="swatch"></span><span>${devId}</span></div>
            <span class="badge ${warn}">${status}</span>
          </div>
          <div class="device-metrics">
            <span>温度 <b>${metricText(d.temperature, "temperature")}</b></span>
            <span>湿度 <b>${metricText(d.humidity, "humidity")}</b></span>
            <span>PM2.5 <b>${formatNumber(d.pm25)}</b></span>
            <span>CO2 <b>${formatNumber(d.co2)}</b></span>
          </div>
        </button>`;
    })
    .join("");

  box.querySelectorAll(".device-card").forEach((card) => {
    card.addEventListener("click", () => {
      const devId = card.dataset.device;
      currentDevice = currentDevice === devId ? null : devId;
      renderDeviceCards(latest);
      updateChart();
      updateAnomalyList();
    });
  });
}

function updateStats() {
  fetch("/api/stats")
    .then((r) => r.json())
    .then((s) => {
      animateNumber($("#statDevices"), s.device_count || 0);
      animateNumber($("#statTotal"), s.total_records || 0);
      animateNumber($("#statAnomalies"), s.anomaly_count || 0);
      animateNumber($("#statAgg"), s.aggregate_count || 0);
      renderDeviceCards(s.latest);
      updateQualitySummary(s);
    })
    .catch((e) => console.error("获取统计失败:", e));
}

function updateAnomalyList() {
  fetch("/api/data/latest?limit=200")
    .then((r) => r.json())
    .then((data) => {
      let list = data.filter((d) => d.anomaly);
      if (currentDevice) list = list.filter((d) => d.device_id === currentDevice);
      list = list.slice(0, 20);

      const box = $("#anomalyItems");
      if (list.length === 0) {
        box.innerHTML = '<div class="empty">暂无异常事件</div>';
        return;
      }

      box.innerHTML = list
        .map((d) => {
          const c = colorForDevice(d.device_id);
          return `
            <div class="anomaly-item">
              <div>
                <div class="anomaly-who" style="color:${c}">${d.device_id}</div>
                <div class="anomaly-reason">${d.anomaly_reason || "指标超过阈值"}</div>
              </div>
              <div class="anomaly-time">${new Date(d.timestamp).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}</div>
            </div>`;
        })
        .join("");
    })
    .catch((e) => console.error("获取异常事件失败:", e));
}

function updateData() {
  fetch("/api/data/latest?limit=240")
    .then((r) => r.json())
    .then((data) => {
      allData = data;
      updateChart();
    })
    .catch((e) => {
      console.error("获取数据失败:", e);
      $("#statusDot").style.background = "#dc2626";
      $("#statusDot").style.boxShadow = "0 0 0 5px rgba(220, 38, 38, 0.12)";
      $("#statusText").textContent = "连接中断";
    });
}

function refreshAll() {
  $("#statusDot").style.background = "#059669";
  $("#statusDot").style.boxShadow = "0 0 0 5px rgba(5, 150, 105, 0.12)";
  $("#statusText").textContent = "实时运行中";
  updateData();
  updateStats();
  updateAnomalyList();
}

function startCountdown() {
  let c = POLL_INTERVAL / 1000;
  setInterval(() => {
    c -= 1;
    if (c <= 0) {
      c = POLL_INTERVAL / 1000;
      refreshAll();
    }
    $("#countdown").textContent = c;
  }, 1000);
}

function bindTabs() {
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentMetric = tab.dataset.metric;
      updateChart();
    });
  });
}

function init() {
  initChart();
  bindTabs();
  refreshAll();
  startCountdown();
}

document.addEventListener("DOMContentLoaded", init);
