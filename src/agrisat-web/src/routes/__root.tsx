import {
	HeadContent,
	Outlet,
	Scripts,
	createRootRouteWithContext,
	useRouterState,
} from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { AppLayout } from "../components/layout/AppLayout";
import { TooltipProvider } from "../components/ui/tooltip";

import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";

import appCss from "../styles.css?url";

import type { QueryClient } from "@tanstack/react-query";

interface MyRouterContext {
	queryClient: QueryClient;
}

const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`;

const BARE_ROUTES = new Set(["/"]);

export const Route = createRootRouteWithContext<MyRouterContext>()({
	notFoundComponent: () => (
		<div className="flex h-screen w-full flex-col items-center justify-center gap-2 bg-[var(--background)] text-[var(--foreground)]">
			<h1 className="text-2xl font-semibold">404</h1>
			<p className="text-sm text-zinc-500">Page not found</p>
			<a href="/" className="mt-2 text-sm text-emerald-600 hover:underline">Go home</a>
		</div>
	),
	component: RootComponent,
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "AgriSat — Agricultural Satellite Monitoring",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
			{
				rel: "stylesheet",
				href: "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css",
			},
		],
	}),
	shellComponent: RootDocument,
});

function RootComponent() {
	const { queryClient } = Route.useRouteContext();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const isBare = BARE_ROUTES.has(pathname);

	return (
		<QueryClientProvider client={queryClient}>
			<TooltipProvider delayDuration={300}>
				{isBare ? (
					<Outlet />
				) : (
					<AppLayout>
						<Outlet />
					</AppLayout>
				)}
			</TooltipProvider>
		</QueryClientProvider>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
				<HeadContent />
			</head>
			<body className="font-sans antialiased [overflow-wrap:anywhere] selection:bg-[rgba(79,184,178,0.24)]">
				{children}
				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
						TanStackQueryDevtools,
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}
