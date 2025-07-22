import { App } from "./app.js";

let app;
document.addEventListener("DOMContentLoaded", () => {
    app = new App();
    window.app = app;
});
