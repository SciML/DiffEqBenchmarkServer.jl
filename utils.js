var fs = require("fs")

exports.generate_report = (report, cb) => {
	if (!fs.existsSync(__dirname + `/reports/${report.repo}`)){
		fs.mkdirSync(__dirname + `/reports/${report.repo}`);
	}

	if (!fs.existsSync(__dirname + `/reports/${report.repo}/${report.pr}`)){
		fs.mkdirSync(__dirname + `/reports/${report.repo}/${report.pr}`);
	}
	if(fs.existsSync(__dirname + `/reports/${report.repo}/${report.pr}/${report.commit}.waiting.json`)) {
		fs.unlinkSync(__dirname + `/reports/${report.repo}/${report.pr}/${report.commit}.waiting.json`)
	}
	if(fs.existsSync(__dirname + `/reports/${report.repo}/${report.pr}/${report.commit}.running.json`)) {
		fs.unlinkSync(__dirname + `/reports/${report.repo}/${report.pr}/${report.commit}.running.json`)
	}
	fs.writeFile(__dirname + `/reports/${report.repo}/${report.pr}/${report.commit}.json`,
				JSON.stringify(report.items), (err) => {
					if (err)
						cb(false);
					else
						cb(true);
				})
}

exports.generate_temp_report = (repo, pr, commit) => {
	if (!fs.existsSync(__dirname + `/reports/${repo}`)){
		fs.mkdirSync(__dirname + `/reports/${repo}`);
	}

	if (!fs.existsSync(__dirname + `/reports/${repo}/${pr}`)){
		fs.mkdirSync(__dirname + `/reports/${repo}/${pr}`);
	}

	if (fs.existsSync(__dirname + `/reports/${repo}/${pr}/${commit}.failed.json`))
		fs.unlinkSync(__dirname + `/reports/${repo}/${pr}/${commit}.failed.json`)

	fs.writeFileSync(__dirname + `/reports/${repo}/${pr}/${commit}.waiting.json`, "")
}

exports.job_started = (repo, pr, commit) => {
	fs.unlinkSync(__dirname + `/reports/${repo}/${pr}/${commit}.waiting.json`)
	fs.writeFileSync(__dirname + `/reports/${repo}/${pr}/${commit}.running.json`, "")
}

exports.job_failed = (repo, pr, commit) => {
	fs.unlinkSync(__dirname + `/reports/${repo}/${pr}/${commit}.running.json`)
	fs.writeFileSync(__dirname + `/reports/${repo}/${pr}/${commit}.failed.json`, "")
}

exports.is_already_queued = (repo, pr, commit) => {
	if (!fs.existsSync(__dirname + `/reports/${repo}/`)) {
		return false;
	}
	if (!fs.existsSync(__dirname + `/reports/${repo}/${pr}/`)) {
		return false;
	}
	if (fs.existsSync(__dirname + `/reports/${repo}/${pr}/${commit}.running.json`) ||
		fs.existsSync(__dirname + `/reports/${repo}/${pr}/${commit}.waiting.json`)) {
		return true;
	}
	else {

		all = fs.readdirSync(__dirname + `/reports/${repo}/${pr}/`)
		flag = false;
		all.forEach(build => {
			if((build.indexOf(".waiting.json") !== -1) ||
			   (build.indexOf(".running.json") !== -1)) {
				flag = true;
			}
		})
		return flag;
	}
}

exports.abort = (repo, pr) => {
	all = fs.readdirSync(__dirname + `/reports/${repo}/${pr}/`)
	all.forEach(build => {
		if((build.indexOf(".waiting.json") !== -1) || (build.indexOf(".running.json") !== -1)) {
			fs.unlinkSync(__dirname + `/reports/${repo}/${pr}/${build}`)
		}
	})
}