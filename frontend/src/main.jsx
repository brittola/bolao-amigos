import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import moment from "moment";
import "moment/locale/pt-br";
import { AuthProvider } from "./context/AuthContext.jsx";
import App from "./App.jsx";
import "./styles/base.css";

moment.locale("pt-br");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
