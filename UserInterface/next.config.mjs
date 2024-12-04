/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
	//output: "export",

	// Optional: Change links `/me` -> `/me/` and emit `/me.html` -> `/me/index.html`
	// trailingSlash: true,

	// Optional: Prevent automatic `/me` -> `/me/`, instead preserve `href`
	// skipTrailingSlashRedirect: true,

	// Optional: Change the output directory `out` -> `dist`
	distDir: "./build", //"../wwwroot",

	// Disable ESLint during builds
	eslint: {
		// This allows production builds to complete even if there are ESLint errors
		ignoreDuringBuilds: true,
	},

	// Disable TypeScript type checking during builds
	typescript: {
		// This allows production builds to complete even if there are TypeScript type errors
		ignoreBuildErrors: true,
	},
};

export default nextConfig;
