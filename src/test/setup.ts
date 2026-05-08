// vitest setup. happy-dom 環境でテストを実行する。
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
	cleanup();
});
