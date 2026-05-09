fn main() {
	// CI からは GIT_COMMIT を直接渡してもらう。ローカル開発時は git コマンドで補完。
	let commit = std::env::var("GIT_COMMIT").ok().or_else(|| {
		std::process::Command::new("git")
			.args(["rev-parse", "HEAD"])
			.output()
			.ok()
			.and_then(|o| {
				if o.status.success() {
					String::from_utf8(o.stdout)
						.ok()
						.map(|s| s.trim().to_string())
				} else {
					None
				}
			})
	});
	let commit = commit.unwrap_or_else(|| "unknown".to_string());
	println!("cargo:rustc-env=GIT_COMMIT={commit}");
	println!("cargo:rerun-if-env-changed=GIT_COMMIT");
	// ローカルで HEAD が動いたら build.rs を再実行する (best effort)。
	println!("cargo:rerun-if-changed=../.git/HEAD");

	tauri_build::build()
}
