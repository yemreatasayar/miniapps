import React from "react";
import ReactDOM from "react-dom/client";
import DistributionApp from "./DistributionApp";
import { registerDistributionPwa } from "./registerDistributionPwa";
import "./styles/global.css";

registerDistributionPwa();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DistributionApp />
  </React.StrictMode>
);
