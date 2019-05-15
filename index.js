var express = require("express");
var logger  = require("logger").createLogger('development.log');
// var ejs     = require("ejs");
var fs      = require("fs");
var request = require("request")
var utils   = require("./utils");
var app = express()
app.use(express.urlencoded());
app.use(express.json());
app.use(express.static('public'))
app.set('view engine', 'ejs');
!fs.existsSync(__dirname + `/reports`) && fs.mkdirSync(__dirname + `/reports`);
config = JSON.parse(fs.readFileSync(__dirname + "/config.json"))
// Mongo Setup
const MongoClient = require('mongodb').MongoClient;
const uri = config.db_url;
let db;
MongoClient.connect(uri, { useNewUrlParser: true }, function(err, client) {
	if (err) throw err;
	db = client.db("main");
});
// CONFIG BEGIN
KEY = "secret_secret_secret"
// CONFIG END

app.post("/report", (req, res) => {
	key = req.body.key;
	if (key !== KEY) {
		res.status(401).send("not authorized");
		return;
	}

	/* Generate a static report */
	report = req.body.report;
	utils.generate_report(report, db, (success) => {
		if (success) {
			logger.info(`Performance report generated for ${report.repo}#${report.pr}(${report.commit})`)
		}
		else {
			logger.error(`Error generating report for ${report.repo}#${report.pr}(${report.commit})`)
			res.send("error");
			return;
		}
	});

	res.send("ok");
});

app.get("/", (req, res) => {
	res.render("index")
});

app.get("/packages/:repo", (req, res) => {
	res.render("repo", {repo: req.params.repo});
})

app.get("/packages/:repo/:pr", (req, res) => {
	res.render("pr", req.params)
})

app.get("/packages/:repo/:pr/:commit", (req, res) => {
	/* Latest report */
	res.render("build", {repo: req.params.repo, pr: req.params.pr, commit: req.params.commit})
}) 

var listener = app.listen(process.env.PORT || 8081, () => {
	logger.info(`Server running at ${listener.address().port}`)
})

// API

app.get("/api/pr/:repo/:pr", (req,res) => {
	request({
		headers: {
			"User-Agent": config.admin
		},
		uri: `https://api.github.com/repos/${config.org}/${req.params.repo}/pulls/${req.params.pr}?client_id=${config.github_outh_client_id}&client_secret=${config.github_outh_client_secret}`,
		method: "GET"
	}, (err, res2, body) => {
		if (err) {
			res.status(500).send("Internal Error");
		}
		else {
			json = JSON.parse(body)
			res.json({number: json.number, author: json.user.login, title: json.title})
		}
	})
})

app.get("/api/builds/:repo/:pr", (req, res) => {
	if (!fs.existsSync(__dirname + `/reports/${req.params.repo}`)) {
		res.json({ message: "no repo" })
		return;
	}
	if (!fs.existsSync(__dirname + `/reports/${req.params.repo}/${req.params.pr}`)) {
		res.json({ message: "no pull" })
		return;
	}
	q = {"repo": req.params.repo, "pull": parseInt(req.params.pr)}
	db.collection("pulls").findOne(q, (err, result) => {
		if (err) throw err;
		builds = fs.readdirSync(__dirname + `/reports/${req.params.repo}/${req.params.pr}`)
		for (var i = builds.length - 1; i >= 0; i--) {
			builds[i] = builds[i].substr(0, builds[i].length-5) // Removing `.json`
		}
		if (result)
			latest = result.latest
		else
			latest = ""
		res.json({builds, latest})
	})
})

app.get("/api/build/:repo/:pr/:commit", (req, res) => {
	if(fs.existsSync(__dirname + `/reports/${req.params.repo}/${req.params.pr}/${req.params.commit}.json`))
		res.sendFile(__dirname + `/reports/${req.params.repo}/${req.params.pr}/${req.params.commit}.json`)
	else
		res.status(404).send("not found");
})

app.get("/api/repo_open_pulls/:repo", (req, res) => {
	request({
		headers: {
			"User-Agent": config.admin
		},
		uri: `https://api.github.com/repos/${config.org}/${req.params.repo}/pulls?client_id=${config.github_outh_client_id}&client_secret=${config.github_outh_client_secret}&state=opened`,
		method: "GET"
	}, (err, res2, body) => {
		if (err) {
			res.status(500).send("Internal Error");
		}
		else {
			data = []
			open_prs = JSON.parse(body)
			if(!(open_prs instanceof Array)) {
				res.status(500).send("Internal Error");
				return;
			}
			open_prs.forEach((pr) => {
				obj = { title: pr.title, number: pr.number, author: pr.user.login }
				data.push(obj);
			})
			res.json(data);
		}
	})
})