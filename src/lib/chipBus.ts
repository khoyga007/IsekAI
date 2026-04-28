/**
 * Tiny event bus for quick-action chips.
 * StoryView emits when a chip is clicked; InputBar listens and runs the turn
 * in "do" mode with that text. Keeps the two components decoupled.
 */

type Listener = (text: string) => void;

const listeners = new Set<Listener>();

export const chipBus = {
  emit(text: string) {
    for (const l of listeners) l(text);
  },
  on(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
