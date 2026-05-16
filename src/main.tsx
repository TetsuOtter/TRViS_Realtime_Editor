import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { MonitorWindowApp } from "./components/Monitor/MonitorWindowApp";
import "./styles/global.css";

// 別ウィンドウは同一フロントエンドを `#monitor` 付きで読み込み、ここで分岐する。
const isMonitorWindow = window.location.hash.replace(/^#/, "") === "monitor";

ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>{isMonitorWindow ? <MonitorWindowApp /> : <App />}</React.StrictMode>,
);
