import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { App } from "./App";
import "@fontsource/roboto/latin-400.css";
import "@fontsource/roboto/vietnamese-400.css";
import "@fontsource/roboto/latin-500.css";
import "@fontsource/roboto/vietnamese-500.css";
import "@fontsource/roboto/latin-600.css";
import "@fontsource/roboto/vietnamese-600.css";
import "@fontsource/roboto/latin-700.css";
import "@fontsource/roboto/vietnamese-700.css";
import "./styles.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
