import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite"
import path from "path";
import honoDevPlugin from "./vite/__plugins/hono-dev-plugin";
import assetOptimizerPlugin from "./vite/__plugins/asset-optimizer-plugin";

const root = path.resolve(__dirname, "../..");

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, root, '');
	Object.assign(process.env, env);

	return {
		// All env files live at the repo root — keep Vite's own env loading there too,
		// so packages/web/.env* files can never shadow the root .env.
		envDir: root,
		plugins: [honoDevPlugin(), react(), tailwind(), assetOptimizerPlugin()],
		resolve: {
			alias: {
				"@": path.resolve(__dirname, "./src/web"),
			},
		},
		server: {
			allowedHosts: true,
			hmr: { overlay: false, },
			cors: false
		},
		build: {
			// Split heavy libraries into cacheable vendor chunks so the first
			// page load only downloads what it actually needs.
			rollupOptions: {
				output: {
					manualChunks(id: string) {
						if (!id.includes("node_modules")) return;
						if (id.includes("mermaid")) return "vendor-mermaid";
						if (id.includes("katex")) return "vendor-katex";
						if (id.includes("highlight.js")) return "vendor-highlight";
						if (id.includes("pdfjs-dist") || id.includes("unpdf")) return "vendor-pdf";
						if (id.includes("chart.js") || id.includes("react-chartjs-2")) return "vendor-charts";
						if (id.includes("framer-motion")) return "vendor-motion";
					},
				},
			},
		}
	};
});
