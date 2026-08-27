import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/** Nothing to subscribe to: hydration happens once and never un-happens. */
const subscribe = () => () => {};

/**
 * To support static rendering, this value needs to be re-calculated on the
 * client side for web.
 *
 * The server renders light, the client renders the real scheme, and
 * `useSyncExternalStore` is how React is told those two differ — rather than
 * an effect that sets state on mount purely to say "we are on the client
 * now", which costs a second render of the whole tree.
 */
export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const colorScheme = useRNColorScheme();

  return hasHydrated ? colorScheme : 'light';
}
