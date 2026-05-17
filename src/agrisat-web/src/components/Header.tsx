import { Link } from "@tanstack/react-router";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
	return (
		<header className="sticky top-0 z-50 h-[54px] border-b border-[var(--line)] bg-[var(--header-bg)]  px-4 backdrop-blur-lg">
			<nav className="flex items-center gap-x-3 py-2">
				<h2 className="m-0 flex-shrink-0 text-base font-semibold tracking-tight">
					<Link
						to="/"
						className="inline-flex items-center gap-2 px-3 py-1.5 text-sm   "
					> 
						AgriSat
					</Link>
				</h2>

				<div className="ml-auto flex items-center gap-2">
					<ThemeToggle />
				</div>
			</nav>
		</header>
	);
}
