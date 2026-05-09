// vitest setup. happy-dom 環境でテストを実行する。
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
	cleanup();
});

// `codemirror-json-schema` v0.8 は内部で拡張子なしの ESM 相対 import を含んでおり、
// vitest (Node ESM) では解決に失敗する。テストでは入力補完 / リンタは不要なので
// 何もしないスタブに差し替える。
// (実行時の Vite/Tauri ビルドでは optimizeDeps で正しく解決される)
vi.mock("codemirror-json-schema", () => ({
	jsonSchema: () => [],
	jsonCompletion: () => () => null,
	jsonSchemaLinter: () => () => [],
	jsonSchemaHover: () => () => null,
	handleRefresh: () => false,
	stateExtensions: () => [],
}));
