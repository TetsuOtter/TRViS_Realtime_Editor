// Force all packages to use the same @codemirror/view version to avoid TypeScript type conflicts.
function readPackage(pkg) {
	if (pkg.dependencies?.["@codemirror/view"]) {
		pkg.dependencies["@codemirror/view"] = "6.43.6";
	}
	if (pkg.peerDependencies?.["@codemirror/view"]) {
		pkg.peerDependencies["@codemirror/view"] = "6.43.6";
	}
	return pkg;
}

module.exports = { hooks: { readPackage } };
