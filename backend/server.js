const express = require("express");
const { createServer: createViteServer } = require("vite");
const { path } = require("path");
const apiRoutes = require("./api/routes");
const fs = require("node:fs/promises");

// const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

async function createServerApp() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use(express.json());

  app.use("/api", apiRoutes);

  app.use("*", async (req, res, next) => {
    const isProduction = false;
    const url = req.originalUrl;
    const base = process.env.BASE || "/";
    const templateHtml = isProduction
      ? await fs.readFile("./dist/client/index.html", "utf-8")
      : "";
    const ssrManifest = isProduction
      ? await fs.readFile("./dist/client/.vite/ssr-manifest.json", "utf-8")
      : undefined;

    try {
      const url = req.originalUrl.replace(base, "");

      let template;
      let render;
      if (!isProduction) {
        // Always read fresh template in development
        template = await fs.readFile("./frontend/index.html", "utf-8");
        template = await vite.transformIndexHtml(url, template);
        render = (await vite.ssrLoadModule("/src/entry-server.js")).render;
      } else {
        template = templateHtml;
        render = (await import("./dist/server/entry-server.js")).render;
      }

      const rendered = await render(url, ssrManifest);

      const html = template
        .replace(`<!--app-head-->`, rendered.head ?? "")
        .replace(`<!--app-html-->`, rendered.html ?? "");

      res.status(200).set({ "Content-Type": "text/html" }).send(html);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });

  const port = process.env.PORT || 8080;

  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
  });
}

createServerApp();
