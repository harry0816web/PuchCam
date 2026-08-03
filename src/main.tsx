import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PunchCam from "../app/page";
import PunchTest from "../app/testing";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {window.location.pathname === "/testing" ? <PunchTest /> : <PunchCam />}
  </StrictMode>,
);
