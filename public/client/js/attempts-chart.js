"use strict";
(() => {
  const container = document.querySelector("#historyChart");
  if (!container) return;
  const records = JSON.parse(container.dataset.attempts || "[]");
  if (!records.length) {
    const message = document.createElement("p");
    message.className = "history-chart-empty";
    message.textContent = "Hoàn thành bài luyện tập để bắt đầu theo dõi tiến bộ.";
    container.append(message);
    return;
  }
  const ns = "http://www.w3.org/2000/svg";
  function element(tag, attributes, text) {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes || {})) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const width = 940, height = 280, left = 42, right = 25, top = 20, bottom = 42;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const x = i => records.length === 1 ? left + plotWidth / 2 : left + i * plotWidth / (records.length - 1);
  const score = record => Math.max(0, Math.min(10, record.score / record.maxScore * 10));
  const y = value => top + (10 - value) * plotHeight / 10;
  const svg = element("svg", {viewBox: `0 0 ${width} ${height}`, role:"img", "aria-labelledby":"historyChartSvgTitle"});
  svg.append(element("title", {id:"historyChartSvgTitle"}, "Điểm các bài làm gần nhất, sắp theo thời gian từ cũ đến mới."));
  for (let value = 0; value <= 10; value += 2) {
    svg.append(element("line", {x1:left,x2:width-right,y1:y(value),y2:y(value),stroke:"#e6edf6"}));
    svg.append(element("text", {x:left-12,y:y(value)+4,"text-anchor":"end",fill:"#71829a","font-size":12}, String(value)));
  }
  const points = records.map((record,i) => `${x(i)},${y(score(record))}`).join(" ");
  if (records.length > 1) {
    svg.append(element("polygon", {points:`${left},${y(0)} ${points} ${width-right},${y(0)}`,fill:"#e9f1ff"}));
    svg.append(element("polyline", {points,fill:"none",stroke:"#245eb2","stroke-width":3,"stroke-linejoin":"round"}));
  }
  records.forEach((record,i) => {
    const circle = element("circle", {cx:x(i),cy:y(score(record)),r:5,fill:"#245eb2",stroke:"white","stroke-width":2,tabindex:0});
    const date = new Date(record.submittedAt).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"});
    circle.append(element("title", {}, `${record.examTitle}: ${score(record).toFixed(2)}/10 · ${date}`));
    svg.append(circle);
    if (i === 0 || i === records.length-1 || i % Math.max(1,Math.ceil(records.length/7)) === 0) {
      svg.append(element("text", {x:x(i),y:height-16,"text-anchor":"middle",fill:"#71829a","font-size":12},new Date(record.submittedAt).toLocaleDateString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",day:"2-digit",month:"2-digit"})));
    }
  });
  container.append(svg);
})();
