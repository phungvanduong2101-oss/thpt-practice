import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  summaryTrendStats: [
    "avg",
    "min",
    "med",
    "max",
    "p(90)",
    "p(95)",
  ],
};

export default function () {
  const response = http.get("http://localhost:3000/exams", {
    redirects: 0,
  });

  check(response, {
    "Trang đề thi trả HTTP 200": (res) => res.status === 200,
    "Response là HTML": (res) =>
      String(res.headers["Content-Type"]).includes("text/html"),
  });

  sleep(1);
}