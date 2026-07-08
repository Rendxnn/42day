import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { DashboardLocaleProvider } from "./i18n";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DashboardLocaleProvider>
      <App />
    </DashboardLocaleProvider>
  </StrictMode>,
);
