const POLL_INTERVAL = 3000;   // 刷新间隔 ms
const MAX_POINTS = 60;        // 图表最多显示点数

// 每个设备分配一种固定的高辨识度颜色
const DEVICE_PALETTE = [
  "#22d3ee", "#a78bfa", "#f472b6", "#34d399",
  "#fbbf24", "#60a5fa", "#fb7185", "#4ade80",
  "#e879f9", "#38bdf8",
];
const deviceColorMap = {};
function colorForDevice(devId) {
  if (!(devId in deviceColorMap)) {
    const idx = Object.keys(deviceColorMap).length % DEVICE_PALETTE.length;
    deviceColorMap[devId] = DEVICE_PALETTE[idx];
  }
  return deviceColorMap[devId];
}

let currentMetric = "temperature";
let currentDevice = null;
let chart = null;
let allData = [];

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ---------- 数字滚动动画 ----------
function animateNumber(el, target) {
  const from = parseInt(el.dataset.val || "0", 10);
  if (from === target) return;
  el.dataset.val = target;
  const start = performance.now();
  const dur = 600;
  function tick(now) {
    const p = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (target - from) * eased).toLocaleString();
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ---------- 图表 ----------
function initChart() {
  Chart.defaults.color = "#8b95b8";
  Chart.defaults.font.family =
    "-apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif";

  const ctx = $("#mainChart").getContext("2d");
  chart = new Chart(ctx, {
    type: "line",
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500, easing: "easeOutQuart" },
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { position: "top", labels: { usePointStyle: true, boxWidth: 8, padding: 16, color: "#c7cef0" } },
        tooltip: {
          backgroundColor: "rgba(10,14,30,0.92)",
          borderColor: "rgba(255,255,255,0.12)",
          borderWidth: 1, padding: 12, cornerRadius: 10,
          titleColor: "#e8edff", bodyColor: "#c7cef0",
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(255,255,255,0.05)" },
          ticks: { maxTicksLimit: 10, maxRotation: 0, color: "#5a6488" },
          title: { display: true, text: "时间", color: "#5a6488" },
        },
        y: {
          beginAtZero: false,
          grid: { color: "rgba(255,255,255,0.05)" },
          ticks: { color: "#8b95b8" },
          title: { display: true, text: "", color: "#8b95b8" },
        },
      },
    },
  });
}

function getMetricInfo(metric) {
  const map = {
    temperature: { title: "温度 (°C)" },
    humidity: { title: "湿度 (%)" },
    pm25: { title: "PM2.5 (μg/m³)" },
    co2: { title: "CO₂ (ppm)" },
  };
  return map[metric] || { title: metric };
}

function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function updateChart() {
  if (!chart) return;
  chart.options.scales.y.title.text = getMetricInfo(currentMetric).title;

  let filtered = allData;
  if (currentDevice) filtered = allData.filter((d) => d.device_id === currentDevice);

  const groups = {};
  filtered.forEach((d) => {
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
      backgroundColor: hexToRgba(c, 0.12),
      borderWidth: 2.2,
      fill: true,
      pointRadius: records.map((r) => (r.anomaly ? 5.5 : 0)),
      pointHoverRadius: 6,
      pointBackgroundColor: records.map((r) => (r.anomaly ? "#fb5e7e" : c)),
      pointBorderColor: records.map((r) => (r.anomaly ? "#fff" : c)),
      pointBorderWidth: records.map((r) => (r.anomaly ? 1.5 : 0)),
      tension: 0.35,
      spanGaps: true,
    });
  });

  // 用点数最多的设备的时间序列作为 X 轴标签，减少错位
  chart.data.labels = longest.map((r) =>
    new Date(r.timestamp).toLocaleTimeString("zh-CN", {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    })
  );
  chart.data.datasets = datasets;
  chart.update("none");
}

// ---------- 统计 ----------
function updateStats() {
  fetch("/api/stats")
    .then((r) => r.json())
    .then((s) => {
      animateNumber($("#statDevices"), s.device_count || 0);
      animateNumber($("#statTotal"), s.total_records || 0);
      animateNumber($("#statAnomalies"), s.anomaly_count || 0);
      animateNumber($("#statAgg"), s.aggregate_count || 0);
      renderDeviceCards(s.latest);
    })
    .catch((e) => console.error("获取统计失败:", e));
}

function renderDeviceCards(latest) {
  const box = $("#deviceCards");
  if (!latest || Object.keys(latest).length === 0) {
    box.innerHTML = '<div class="empty">暂无设备数据</div>';
    return;
  }
  box.innerHTML = Object.entries(latest)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([devId, d]) => {
      const c = colorForDevice(devId);
      return `
      <div class="device-card ${currentDevice === devId ? "active" : ""}"
           data-device="${devId}" style="--dev-color:${c}">
        <div class="dev-name"><span class="swatch"></span>${devId}</div>
        <div class="dev-metrics">
          <div>温度 <b>${d.temperature ?? "--"}°C</b></div>
          <div>湿度 <b>${d.humidity ?? "--"}%</b></div>
          <div>PM2.5 <b>${d.pm25 ?? "--"}</b></div>
          <div>CO₂ <b>${d.co2 ?? "--"}</b></div>
        </div>
        <span class="dev-status ${d.anomaly ? "warn" : "ok"}">${d.anomaly ? "● 异常" : "● 正常"}</span>
      </div>`;
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

// ---------- 异常列表 ----------
function updateAnomalyList() {
  fetch("/api/data/latest?limit=200")
    .then((r) => r.json())
    .then((data) => {
      let list = data.filter((d) => d.anomaly);
      if (currentDevice) list = list.filter((d) => d.device_id === currentDevice);
      list = list.slice(0, 20);

      const box = $("#anomalyItems");
      if (list.length === 0) {
        box.innerHTML = '<div class="empty">暂无异常事件 ✓</div>';
        return;
      }
      box.innerHTML = list
        .map(
          (d) => `
        <div class="anomaly-item">
          <div><span class="who" style="color:${colorForDevice(d.device_id)}">${d.device_id}</span>
            <span class="reason">${d.anomaly_reason || "异常"}</span></div>
          <div class="time">${new Date(d.timestamp).toLocaleString("zh-CN")}</div>
        </div>`
        )
        .join("");
    });
}

// ---------- 数据 ----------
function updateData() {
  fetch("/api/data/latest?limit=200")
    .then((r) => r.json())
    .then((data) => { allData = data; updateChart(); })
    .catch((e) => {
      console.error("获取数据失败:", e);
      $("#statusDot").style.background = "#fb5e7e";
      $("#statusText").textContent = "连接中断";
    });
}

function refreshAll() {
  $("#statusDot").style.background = "#34d399";
  $("#statusText").textContent = "实时运行中";
  updateData();
  updateStats();
  updateAnomalyList();
}

function startCountdown() {
  let c = POLL_INTERVAL / 1000;
  setInterval(() => {
    if (--c <= 0) { c = POLL_INTERVAL / 1000; refreshAll(); }
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
