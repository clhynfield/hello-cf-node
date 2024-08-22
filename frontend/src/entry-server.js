import { createSSRApp } from "vue";
import App from "./App.vue";

export function render() {
  const app = createSSRApp(App);
  return app;
}
