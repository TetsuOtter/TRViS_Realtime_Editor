// Force all packages to use the same @codemirror/view and @codemirror/state
// versions to avoid runtime "multiple instances" instanceof-check breakage
// and TypeScript type conflicts.
const PINNED = {
	"@codemirror/view": "6.43.6",
	"@codemirror/state": "6.7.1",
};

function readPackage(pkg) {
	for (const [name, version] of Object.entries(PINNED)) {
		if (pkg.dependencies?.[name]) {
			pkg.dependencies[name] = version;
		}
		if (pkg.peerDependencies?.[name]) {
			pkg.peerDependencies[name] = version;
		}
	}
	return pkg;
}

module.exports = { hooks: { readPackage } };
