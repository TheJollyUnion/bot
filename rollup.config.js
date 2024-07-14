import typescript from "rollup-plugin-typescript2"
import resolve from "@rollup/plugin-node-resolve"

export default {
    input: "src/index.ts",
    output: {
        file: "dist/index.js",
        format: "esm",
    },
    external: ["dotenv/config", "telegram", "telegram/sessions/index.js", "telegram/events/index.js", "telegraf", "ottoman"],
    plugins: [
        resolve(),
        typescript({
            tsconfig: "tsconfig.json",
        }),
    ],
}
