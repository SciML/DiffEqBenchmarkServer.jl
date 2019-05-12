var ejs = require("ejs");
var fs  = require("fs");

template = ejs.compile(fs.readFileSync('report.ejs','utf8'))

exports.generate_report = (report, cb) => {
	if (!fs.existsSync(__dirname + `/public/${report.repo}`)){
		fs.mkdirSync(__dirname + `/public/${report.repo}`);
	}

	if (!fs.existsSync(__dirname + `/public/${report.repo}/${report.pr}`)){
		fs.mkdirSync(__dirname + `/public/${report.repo}/${report.pr}`);
	}

	fs.writeFile(__dirname + `/public/${report.repo}/${report.pr}/${report.commit}.html`,
				template(report), (err) => {
					if (err)
						cb(false);
					else
						cb(true);
				})
}