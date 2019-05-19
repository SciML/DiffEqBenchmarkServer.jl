var fs = require("fs")

exports.generate_report = (report, db, cb) => {
	if (!fs.existsSync(__dirname + `/reports/${report.repo}`)){
		fs.mkdirSync(__dirname + `/reports/${report.repo}`);
	}

	if (!fs.existsSync(__dirname + `/reports/${report.repo}/${report.pr}`)){
		fs.mkdirSync(__dirname + `/reports/${report.repo}/${report.pr}`);
	}
	if(fs.existsSync(__dirname + `/reports/${report.repo}/${report.pr}/${report.commit}.waiting.json`)) {
		fs.unlinkSync(__dirname + `/reports/${report.repo}/${report.pr}/${report.commit}.waiting.json`)
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

	fs.writeFileSync(__dirname + `/reports/${repo}/${pr}/${commit}.waiting.json`, "")
}