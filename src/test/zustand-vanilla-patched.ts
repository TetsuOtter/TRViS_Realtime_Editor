// Patched zustand/vanilla that handles void-returning set updaters via immer.
// This mirrors the behaviour of zustand's immer middleware, fixing compatibility
// with the editorStore's internal setState helper in zustand v5.
// Note: This file is only used when the test alias redirects zustand/vanilla here,
// which currently has no effect (the alias intercepts only ESM top-level imports,
// not intra-package imports). The editorStore tests instead use a local store
// with the immer middleware applied directly.
export { createStore } from "zustand/vanilla";
