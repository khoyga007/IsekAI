/**
 * Backward-compat shim. Real code (helpers + Avatar component) now lives
 * in avatar.tsx — we re-export with explicit extension so that imports of
 * "@/lib/avatar" resolve here first (TS prefers .ts), then forward.
 */
export { avatarFor, initials, Avatar } from "./avatar.tsx";
export type { } from "./avatar.tsx";
