var ejs = require("ejs");
var fs  = require("fs");

template = ejs.compile(fs.readFileSync('report.ejs','utf8'))

exports.generate_report = (report, db, cb) => {
	if (!fs.existsSync(__dirname + `/reports/${report.repo}`)){
		fs.mkdirSync(__dirname + `/reports/${report.repo}`);
	}

	if (!fs.existsSync(__dirname + `/reports/${report.repo}/${report.pr}`)){
		fs.mkdirSync(__dirname + `/reports/${report.repo}/${report.pr}`);
	}
	db.collection("pulls").find({repo: report.repo, pull: report.pr}).toArray((err, arr) => {
		if (err)
			throw err;
		if(arr.length == 0) {
			db.collection("pulls").insertOne({repo: report.repo, pull: report.pr, latest: report.commit}, (err, res) => {
				if (err)
					throw err;
			})
		}
		else {
			db.collection("pulls").updateOne({repo: report.repo, pull: report.pr}, { $set: {latest: report.commit}}, (err, res) => {
				if (err)
					throw err;
			})
		}
	})
	fs.writeFile(__dirname + `/reports/${report.repo}/${report.pr}/${report.commit}.html`,
				template(report), (err) => {
					if (err)
						cb(false);
					else
						cb(true);
				})
}