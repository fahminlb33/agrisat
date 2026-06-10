import { createContext, useContext, useRef, type ReactNode } from "react";
import { useStore as useZustandStore } from "zustand";

import {
	createFullscreenControlsStore,
	type FullscreenControlsStore,
} from "#/stores/fullscreen-controls";
import {
	createQueryContextStore,
	type QueryContextStore,
} from "#/stores/query-context";

type ControlsStoreApi = ReturnType<typeof createFullscreenControlsStore>;

const ControlsContext = createContext<ControlsStoreApi | null>(null);

type QueryStoreApi = ReturnType<typeof createQueryContextStore>;

const QueryStoreContext = createContext<QueryStoreApi | null>(null);

interface ControlProviderProps {
	queryStore: QueryStoreApi;
	children: ReactNode;
}

export function ControlProvider({ queryStore, children }: ControlProviderProps) {
	const storeRef = useRef<ControlsStoreApi | null>(null);
	if (!storeRef.current) {
		storeRef.current = createFullscreenControlsStore();
	}

	return (
		<QueryStoreContext.Provider value={queryStore}>
			<ControlsContext.Provider value={storeRef.current}>
				{children}
			</ControlsContext.Provider>
		</QueryStoreContext.Provider>
	);
}

export function useControls<T>(selector: (state: FullscreenControlsStore) => T): T {
	const store = useContext(ControlsContext);
	if (!store) {
		throw new Error("useControls must be used within a ControlProvider");
	}
	return useZustandStore(store, selector);
}

export function useQueryContext<T>(selector: (state: QueryContextStore) => T): T {
	const store = useContext(QueryStoreContext);
	if (!store) {
		throw new Error("useQueryContext must be used within a ControlProvider");
	}
	return useZustandStore(store, selector);
}
